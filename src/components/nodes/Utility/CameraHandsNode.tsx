"use client";
import React from "react";
import { NodeSpec } from "../../node-framework/types";
import { useMediaPipeHands, HandResult } from "../../../hooks/useMediaPipeHands";
import { NodeShell } from "../../node-framework/NodeShell";

// ─── Spec ────────────────────────────────────────────────────────────────────

export const spec: NodeSpec = {
    type: "camera-hands",
    params: [
        // Hidden from the standard parameter auto-renderer because we build a custom UI for them below
        { key: "hand1x", kind: "number", default: 0, min: 0, max: 1, step: 0.001, label: "Hand 1 X", handle: false, hidden: true },
        { key: "hand1y", kind: "number", default: 0, min: 0, max: 1, step: 0.001, label: "Hand 1 Y", handle: false, hidden: true },
        { key: "hand2x", kind: "number", default: 0, min: 0, max: 1, step: 0.001, label: "Hand 2 X", handle: false, hidden: true },
        { key: "hand2y", kind: "number", default: 0, min: 0, max: 1, step: 0.001, label: "Hand 2 Y", handle: false, hidden: true },
    ],
    outputs: [
        { id: "hand1x", role: "param-out", label: "Hand 1 X" },
        { id: "hand1y", role: "param-out", label: "Hand 1 Y" },
        { id: "hand2x", role: "param-out", label: "Hand 2 X" },
        { id: "hand2y", role: "param-out", label: "Hand 2 Y" },
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
    const [deviceId, setDeviceId] = React.useState<string>(
        typeof data.camera === "string" ? data.camera : "default"
    );

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
        deviceId: deviceId !== "default" ? deviceId : undefined,
        onHands: handleHands,
    });

    const handleCameraChange = React.useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        setDeviceId(val);
        onParameterChange(id, "camera", val);
    }, [id, onParameterChange]);

    // Update the underlying hidden parameters with our tracking state, 
    // so that NodeShell displays the outputs internally with the current state (if we decide to show values)
    // Actually, NodeShell doesn't render param-out readouts, so we'll 
    // leave the values purely to `onParameterChange` propagating to the audio engine.

    return (
        // We pass the raw spec now, and NodeShell handles creating the 4 output handles gracefully
        <NodeShell id={id} data={data as unknown as Record<string, unknown>} spec={spec} selected={selected} onParameterChange={onParameterChange}>
            {/* Custom UI payload */}
            <div className="flex flex-col gap-2 relative mt-1 min-w-[200px]">
                {/* Canvas preview */}
                <div className="relative rounded-lg overflow-hidden" style={{ background: "#000", height: 130 }}>
                    <video ref={videoRef} style={{ display: "none" }} muted playsInline />
                    <canvas
                        ref={canvasRef}
                        width={200}
                        height={130}
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

                {/* Camera selector */}
                <select
                    value={deviceId}
                    onChange={handleCameraChange}
                    className="w-full bg-black/20 border border-white/10 rounded-md text-[11px] text-white/80 px-2 py-1 outline-none appearance-none cursor-pointer nodrag"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                >
                    <option value="default">Default Camera</option>
                    {devices.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `Camera ${d.deviceId.slice(0, 8)}`}
                        </option>
                    ))}
                </select>
            </div>
        </NodeShell>
    );
}
