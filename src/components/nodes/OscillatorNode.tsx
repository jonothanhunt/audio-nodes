"use client";

import React from "react";
import { Volume2 } from "lucide-react";
import { getNodeMeta } from "@/lib/nodeRegistry";
import { NodeUIProvider, useNodeUI } from "../node-ui/NodeUIProvider";
import { HandleLayer } from "../node-ui/HandleLayer";
import { NumberParam } from "../node-ui/params/NumberParam";
import { labelCls, inputCls } from "../node-ui/styles/inputStyles";
import NodeHelpPopover, { HelpItem } from "../node-ui/NodeHelpPopover";

interface OscillatorNodeProps {
    id: string;
    selected?: boolean;
    data: {
        frequency?: number;
        amplitude?: number;
        waveform?: string;
        onParameterChange: (
            nodeId: string,
            parameter: string,
            value: string | number,
        ) => void;
    };
}

const waveforms = ["sine", "square", "sawtooth", "triangle"] as const;

const paramConfig = [
    {
        key: "frequency",
        type: "number",
        min: 20,
        max: 2000,
        step: 1,
        default: 440,
    },
    {
        key: "amplitude",
        type: "number",
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.5,
    },
] as const;

type OscParamKey = (typeof paramConfig)[number]["key"];

export default function OscillatorNode({
    id,
    data,
    selected,
}: OscillatorNodeProps) {
    const { accentColor } = getNodeMeta("oscillator");
    const { onParameterChange } = data;
    const [helpOpen, setHelpOpen] = React.useState(false);
    const helpBtnRef = React.useRef<HTMLButtonElement | null>(null);

    // Ensure defaults
    React.useEffect(() => {
        paramConfig.forEach((p) => {
            const current = (data as Record<string, unknown>)[p.key];
            if (current == null) onParameterChange(id, p.key, p.default);
        });
        if ((data as Record<string, unknown>)["waveform"] == null) {
            onParameterChange(id, "waveform", "sine");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const numericKeys = paramConfig
        .filter((p) => p.type === "number")
        .map((p) => p.key);
    const getValue = (key: OscParamKey) =>
        (data as Record<string, unknown>)[key];

    return (
        <NodeUIProvider accentColor={accentColor} numericKeys={numericKeys}>
            {selected && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-xs text-gray-500">
                    ID: {id}
                </div>
            )}
            <div
                className={`relative bg-gray-900 rounded-lg p-4 shadow-lg border`}
                style={{
                    borderColor: accentColor,
                    boxShadow: selected
                        ? `0 0 0 1px ${accentColor}, 0 0 12px -2px ${accentColor}`
                        : undefined,
                }}
            >
                <div
                    className="pointer-events-none absolute inset-0 rounded-lg"
                    style={{
                        background: `linear-gradient(135deg, ${accentColor}26, transparent 65%)`,
                    }}
                />

                <div className="flex items-center gap-2 mb-3 relative">
                    <Volume2
                        className="w-4 h-4 -translate-y-0.5"
                        style={{ color: accentColor }}
                    />
                    <span
                        className="title-font text-base"
                        style={{ color: accentColor }}
                    >
                        Oscillator
                    </span>
                    <div className="ml-auto flex items-center">
                        <button
                            ref={helpBtnRef}
                            type="button"
                            aria-label="About this node"
                            className="nodrag inline-flex items-center justify-center w-5 h-5 rounded-full bg-white text-gray-700 text-[11px] font-semibold border border-gray-300 shadow-sm hover:bg-gray-100"
                            onClick={(e) => {
                                e.stopPropagation();
                                setHelpOpen((v) => !v);
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            ?
                        </button>
                    </div>
                </div>

                <NodeHelpPopover
                    open={helpOpen}
                    onClose={() => setHelpOpen(false)}
                    anchorRef={helpBtnRef as React.RefObject<HTMLElement>}
                    title="Oscillator"
                    description="Basic oscillator with frequency and amplitude controls."
                    inputs={
                        [
                            {
                                name: "Frequency",
                                description: "Pitch of the waveform (Hz).",
                            },
                            {
                                name: "Amplitude",
                                description: "Output level (0–1).",
                            },
                            {
                                name: "Waveform",
                                description: "Shape of the generated signal.",
                            },
                        ] as HelpItem[]
                    }
                    outputs={
                        [
                            {
                                name: "Audio Out",
                                description: "Audio signal output.",
                            },
                        ] as HelpItem[]
                    }
                />

                <div className="grid grid-cols-[minmax(16rem,_auto)_auto] gap-y-2 gap-x-4">
                    <div className="space-y-2 col-span-1">
                        {paramConfig.map((cfg) => (
                            <NumberParam
                                key={cfg.key}
                                nodeId={id}
                                paramKey={cfg.key}
                                label={
                                    cfg.key.charAt(0).toUpperCase() +
                                    cfg.key.slice(1)
                                }
                                value={Number(getValue(cfg.key) ?? cfg.default)}
                                min={cfg.min}
                                max={cfg.max}
                                step={cfg.step}
                                badge={
                                    cfg.key === "frequency" ? "Hz" : undefined
                                }
                                onParameterChange={
                                    onParameterChange as (
                                        nid: string,
                                        param: string,
                                        value: number,
                                    ) => void
                                }
                            />
                        ))}
                        <WaveformRow
                            id={id}
                            value={String(
                                (data as Record<string, unknown>)["waveform"] ??
                                    "sine",
                            )}
                            onChange={onParameterChange}
                        />
                    </div>
                    <div className="flex flex-col col-span-1">
                        <AudioOutRow />
                    </div>
                </div>
            </div>
            <HandleLayer includeMidiIn={false} />
        </NodeUIProvider>
    );
}

function WaveformRow({
    id,
    value,
    onChange,
}: {
    id: string;
    value: string;
    onChange: (nid: string, param: string, value: string) => void;
}) {
    const stop = (e: React.SyntheticEvent) => {
        e.stopPropagation();
    };
    return (
        <div className="relative flex items-center h-8">
            <label className={labelCls}>Waveform</label>
            <select
                value={value}
                onChange={(e) => {
                    e.stopPropagation();
                    onChange(id, "waveform", e.target.value);
                }}
                onPointerDown={stop}
                onMouseDown={stop}
                onClick={stop}
                onDoubleClick={stop}
                className={`${inputCls} w-28 nodrag`}
            >
                {waveforms.map((w) => (
                    <option key={w} value={w}>
                        {w}
                    </option>
                ))}
            </select>
        </div>
    );
}

function AudioOutRow() {
    const { outputEl } = useNodeUI();
    return (
        <div
            className="relative flex items-center justify-end h-8"
            ref={(el) => outputEl(el)}
        >
            <span className="text-xs text-gray-300 mr-2">Audio Out</span>
        </div>
    );
}
