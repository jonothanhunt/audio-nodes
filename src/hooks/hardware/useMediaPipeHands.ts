"use client";
import { useEffect, useRef, useState, useCallback } from "react";

export interface HandResult {
    x: number; // 0-1, normalised, mirrored so left=0 right=1
    y: number; // 0-1, normalised, top=0 bottom=1
    landmarks: Array<{ x: number; y: number; z: number }>;
}

interface UseMediaPipeHandsOptions {
    enabled: boolean;
    deviceId?: string; // undefined = system default
    onHands: (hands: HandResult[]) => void;
}

interface UseMediaPipeHandsReturn {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    ready: boolean;
    loading: boolean;
    error: string | null;
}

// Singleton: only one MediaPipe Hands instance across all renders
let _mpHandsInstance: unknown | null = null;
let _mpScriptLoaded = false;
let _mpScriptLoading = false;
const _mpWaiters: Array<() => void> = [];

function loadMediaPipeScript(): Promise<void> {
    if (_mpScriptLoaded) return Promise.resolve();
    if (_mpScriptLoading) {
        return new Promise(res => _mpWaiters.push(res));
    }
    _mpScriptLoading = true;
    return new Promise((resolve, reject) => {
        _mpWaiters.push(resolve);
        const script = document.createElement("script");
        script.crossOrigin = "anonymous";
        script.src =
            "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/hands.js";
        script.onload = () => {
            _mpScriptLoaded = true;
            _mpScriptLoading = false;
            _mpWaiters.forEach(f => f());
            _mpWaiters.length = 0;
        };
        script.onerror = () => {
            _mpScriptLoading = false;
            reject(new Error("Failed to load MediaPipe Hands from CDN"));
        };
        document.head.appendChild(script);
    });
}

export function useMediaPipeHands({
    enabled,
    deviceId,
    onHands,
}: UseMediaPipeHandsOptions): UseMediaPipeHandsReturn {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animRef = useRef<number | null>(null);
    const handsRef = useRef<unknown | null>(null);
    const onHandsRef = useRef(onHands);
    const [ready, setReady] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Keep callback ref stable
    useEffect(() => { onHandsRef.current = onHands; });

    const stopCamera = useCallback(() => {
        if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        setReady(false);
    }, []);

    const drawFrame = useCallback((
        hands: HandResult[],
        video: HTMLVideoElement,
        canvas: HTMLCanvasElement,
    ) => {
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.save();
        // Mirror the canvas horizontally so left = left on screen
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        // Apply greyscale via pixel manipulation for b&w look —
        // CSS filter handles it; we just draw circles for hands
        for (const hand of hands) {
            const cx = hand.x * canvas.width;
            const cy = hand.y * canvas.height;
            ctx.beginPath();
            ctx.arc(cx, cy, 14, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy, 4, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            ctx.fill();
            // Draw skeleton lines for a few key landmarks
            if (hand.landmarks.length >= 9) {
                ctx.strokeStyle = "rgba(255,255,255,0.4)";
                ctx.lineWidth = 1;
                const w = canvas.width; const h = canvas.height;
                const finger = (from: number, to: number) => {
                    const a = hand.landmarks[from]; const b = hand.landmarks[to];
                    if (!a || !b) return;
                    ctx.beginPath();
                    // landmarks are mirrored x
                    ctx.moveTo((1 - a.x) * w, a.y * h);
                    ctx.lineTo((1 - b.x) * w, b.y * h);
                    ctx.stroke();
                };
                [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [0, 9], [9, 10], [10, 11], [11, 12], [0, 13], [13, 14], [14, 15], [15, 16], [0, 17], [17, 18], [18, 19], [19, 20]].forEach(([a, b]) => finger(a, b));
            }
        }
    }, []);

    useEffect(() => {
        if (!enabled) { stopCamera(); return; }

        let cancelled = false;
        setLoading(true);
        setError(null);

        const start = async () => {
            try {
                // 1. Load MediaPipe script
                await loadMediaPipeScript();
                if (cancelled) return;

                // 2. Get camera stream
                const constraints: MediaStreamConstraints = {
                    video: deviceId && deviceId !== "default"
                        ? { deviceId: { exact: deviceId } }
                        : { facingMode: "user" },
                };
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }

                interface MPHandsInstance {
                    setOptions(opts: unknown): void;
                    onResults(cb: (results: { multiHandLandmarks?: Array<Array<{ x: number, y: number, z: number }>> }) => void): void;
                    send(data: { image: HTMLVideoElement }): Promise<void>;
                }
                const MP = (window as unknown as { Hands: new (opts: { locateFile: (f: string) => string }) => MPHandsInstance }).Hands;
                if (!MP) throw new Error("MediaPipe Hands not available");

                if (!_mpHandsInstance) {
                    const instance = new MP({ locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${f}` });
                    instance.setOptions({ maxNumHands: 2, modelComplexity: 0, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });
                    _mpHandsInstance = instance;
                }
                handsRef.current = _mpHandsInstance;
                (handsRef.current as MPHandsInstance).onResults((results) => {
                    if (cancelled) return;
                    const detected: HandResult[] = (results.multiHandLandmarks || []).map(
                        (lms) => {
                            // Wrist (index 0) as representative position
                            const wrist = lms[0] || { x: 0.5, y: 0.5, z: 0 };
                            return {
                                x: 1 - wrist.x, // mirror so left hand = low x
                                y: wrist.y,
                                landmarks: lms,
                            };
                        }
                    );
                    onHandsRef.current(detected);
                    if (videoRef.current && canvasRef.current) {
                        drawFrame(detected, videoRef.current, canvasRef.current);
                    }
                });

                if (cancelled) return;
                setLoading(false);
                setReady(true);

                // 4. RAF loop — send frames to MediaPipe
                const loop = async () => {
                    if (cancelled || !videoRef.current || !handsRef.current) return;
                    if (videoRef.current.readyState >= 2) {
                        try { await (handsRef.current as MPHandsInstance).send({ image: videoRef.current }); } catch { }
                    }
                    animRef.current = requestAnimationFrame(loop);
                };
                animRef.current = requestAnimationFrame(loop);
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : "Camera error");
                    setLoading(false);
                }
            }
        };

        void start();
        return () => {
            cancelled = true;
            stopCamera();
        };
    }, [enabled, deviceId, drawFrame, stopCamera]);

    return { videoRef, canvasRef, ready, loading, error };
}
