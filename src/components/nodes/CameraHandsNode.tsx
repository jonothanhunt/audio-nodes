"use client";
import React from "react";
import { NodeSpec } from "@/components/editor/types";
import { useMediaPipeHands, HandResult } from "@/hooks/hardware/useMediaPipeHands";
import { NodeShell } from "@/components/editor/NodeShell";

// ─── Spec ────────────────────────────────────────────────────────────────────

export const spec: NodeSpec = {
    type: "camera-hands",
    title: "Hand Tracking",
    params: [
        { key: "hand1x", kind: "number", default: 0, min: 0, max: 1, step: 0.001, label: "Hand 1 X", handle: false, hidden: true },
        { key: "hand1y", kind: "number", default: 0, min: 0, max: 1, step: 0.001, label: "Hand 1 Y", handle: false, hidden: true },
        { key: "hand2x", kind: "number", default: 0, min: 0, max: 1, step: 0.001, label: "Hand 2 X", handle: false, hidden: true },
        { key: "hand2y", kind: "number", default: 0, min: 0, max: 1, step: 0.001, label: "Hand 2 Y", handle: false, hidden: true },
        { key: "camera", kind: "select", default: "default", options: ["default"], label: "Camera", handle: false },
    ],
    outputs: [
        { id: "hand1x", role: "param-out", label: "Hand 1 X", variant: "numeric" },
        { id: "hand1y", role: "param-out", label: "Hand 1 Y", variant: "numeric" },
        { id: "hand2x", role: "param-out", label: "Hand 2 X", variant: "numeric" },
        { id: "hand2y", role: "param-out", label: "Hand 2 Y", variant: "numeric" },
    ],
    inputs: [],
    paramHandles: false,
    help: {
        description: "Tracks up to two hands via webcam using MediaPipe and outputs normalised X/Y positions (0–1) as param-out signals.",
        inputs: [],
        outputs: [
            { name: "Hand 1 X", description: "Horizontal position of the first detected hand (0=left, 1=right)." },
            { name: "Hand 1 Y", description: "Vertical position of the first detected hand (0=top, 1=bottom)." },
            { name: "Hand 2 X", description: "Horizontal position of the second detected hand." },
            { name: "Hand 2 Y", description: "Vertical position of the second detected hand." },
        ],
    },
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface CameraHandsData {
    camera?: string;
    hand1x?: number;
    hand1y?: number;
    hand2x?: number;
    hand2y?: number;
    onParameterChange: (nodeId: string, key: string, value: unknown) => void;
    [k: string]: unknown;
}
interface CameraHandsNodeProps { id: string; selected?: boolean; data: CameraHandsData; }

// ─── Node ────────────────────────────────────────────────────────────────────

export default function CameraHandsNode({ id, data, selected }: CameraHandsNodeProps) {
    const { onParameterChange } = data;

    const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);
    const activeCamera = typeof data.camera === "string" ? data.camera : "default";


    React.useEffect(() => {
        navigator.mediaDevices?.enumerateDevices()
            .then(ds => setDevices(ds.filter(d => d.kind === "videoinput")))
            .catch(() => { });
    }, []);

    const [hands, setHands] = React.useState<HandResult[]>([]);

    const handleHands = React.useCallback((detected: HandResult[]) => {
        setHands(detected);
        const h1 = detected[0];
        const h2 = detected[1];
        onParameterChange(id, "hand1x", h1 ? parseFloat(h1.x.toFixed(3)) : 0);
        onParameterChange(id, "hand1y", h1 ? parseFloat(h1.y.toFixed(3)) : 0);
        onParameterChange(id, "hand2x", h2 ? parseFloat(h2.x.toFixed(3)) : 0);
        onParameterChange(id, "hand2y", h2 ? parseFloat(h2.y.toFixed(3)) : 0);
    }, [id, onParameterChange]);

    const { videoRef, canvasRef, ready, loading, error } = useMediaPipeHands({
        enabled: true,
        deviceId: activeCamera !== "default" ? activeCamera : undefined,
        onHands: handleHands,
    });

    const runtimeSpec = React.useMemo(() => {
        return {
            ...spec,
            params: spec.params.map(p => {
                if (p.key === "camera") {
                    return {
                        ...p,
                        options: [
                            { label: "Default Camera", value: "default" },
                            ...devices.map(d => ({
                                label: d.label || `Camera ${d.deviceId.slice(0, 8)}`,
                                value: d.deviceId
                            }))
                        ]
                    };
                }
                return p;
            }),
            renderAfterParams: () => (
                <div className="flex flex-col gap-2 relative mt-1 min-w-[160px]">
                    {/* Canvas preview */}
                    <div className="relative rounded-lg overflow-hidden" style={{ background: "#000", height: 110 }}>
                        <video ref={videoRef} style={{ display: "none" }} muted playsInline />
                        <canvas
                            ref={canvasRef}
                            width={160}
                            height={110}
                            style={{
                                display: "block",
                                width: "100%",
                                height: "100%",
                                filter: "grayscale(1) contrast(1.1)",
                                objectFit: "cover",
                            }}
                        />
                        {(!ready && !error) && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/70">
                                {loading
                                    ? <><div className="w-4 h-4 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
                                        <span className="text-[10px] text-white/50">Loading…</span></>
                                    : <span className="text-[10px] text-white/40">Starting camera…</span>
                                }
                            </div>
                        )}
                        {error && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-3">
                                <span className="text-[10px] text-red-400 text-center leading-tight">{error}</span>
                            </div>
                        )}
                        {ready && (
                            <div className="absolute bottom-1 left-1.5 text-[9px] text-white/50 bg-black/50 rounded px-1 py-0.5 pointer-events-none">
                                {hands.length} Hand{hands.length !== 1 ? "s" : ""}
                            </div>
                        )}
                    </div>
                </div>
            )
        };
    }, [devices, videoRef, canvasRef, ready, loading, error, hands.length]);

    return (
        // We pass the runtime spec now, and NodeShell handles creating the 4 output handles gracefully
        <NodeShell id={id} data={data} spec={runtimeSpec} selected={selected} onParameterChange={onParameterChange} />
    );
}
