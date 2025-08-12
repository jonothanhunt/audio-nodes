"use client";

import React from "react";
import { Volume2 } from "lucide-react";
import { getNodeMeta } from "@/lib/nodeRegistry";
import { NodeUIProvider, useNodeUI } from "../node-ui/NodeUIProvider";
import { HandleLayer } from "../node-ui/HandleLayer";
import { NumberParam } from "../node-ui/params/NumberParam";
import { SelectParam } from "../node-ui/params/SelectParam";
import { labelCls } from "../node-ui/styles/inputStyles";
import NodeHelpPopover, { HelpItem } from "../node-ui/NodeHelpPopover";

interface SynthNodeProps {
    id: string;
    selected?: boolean;
    data: {
        preset?: string;
        waveform?: "sine" | "square" | "sawtooth" | "triangle" | string;
        attack?: number;
        decay?: number;
        sustain?: number;
        release?: number;
        cutoff?: number;
        resonance?: number;
        glide?: number;
        gain?: number;
        maxVoices?: number;
        onParameterChange: (
            nodeId: string,
            parameter: string,
            value: string | number | boolean,
        ) => void;
    };
}

// Param configuration
interface SelectParamConfig {
    key: "preset" | "waveform";
    type: "select";
    options: readonly string[];
    default: string;
    variant: "string";
}
interface NumberParamConfig {
    key:
        | "attack"
        | "decay"
        | "sustain"
        | "release"
        | "cutoff"
        | "resonance"
        | "glide"
        | "gain"
        | "maxVoices";
    type: "number";
    min: number;
    step: number;
    default: number;
    max?: number;
}

type SynthParamConfig = SelectParamConfig | NumberParamConfig;

const synthParamConfig: readonly SynthParamConfig[] = [
    {
        key: "preset",
        type: "select",
        options: ["Init", "Pluck", "Pad", "Bass"] as const,
        default: "Init",
        variant: "string",
    },
    {
        key: "waveform",
        type: "select",
        options: ["sine", "sawtooth", "square", "triangle"] as const,
        default: "sawtooth",
        variant: "string",
    },
    { key: "attack", type: "number", min: 0, step: 0.001, default: 0.005 },
    { key: "decay", type: "number", min: 0, step: 0.001, default: 0.12 },
    {
        key: "sustain",
        type: "number",
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.7,
    },
    { key: "release", type: "number", min: 0, step: 0.001, default: 0.12 },
    {
        key: "cutoff",
        type: "number",
        min: 20,
        max: 20000,
        step: 1,
        default: 10000,
    },
    {
        key: "resonance",
        type: "number",
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.2,
    },
    { key: "glide", type: "number", min: 0, step: 1, default: 0 },
    { key: "gain", type: "number", min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: "maxVoices", type: "number", min: 1, max: 32, step: 1, default: 8 },
];

type SynthParamKey = SynthParamConfig["key"];

export default function SynthesizerNode({
    id,
    data,
    selected,
}: SynthNodeProps) {
    const { accentColor } = getNodeMeta("synth");
    const { onParameterChange } = data;
    const [helpOpen, setHelpOpen] = React.useState(false);
    const helpBtnRef = React.useRef<HTMLButtonElement | null>(null);

    // Ensure defaults
    React.useEffect(() => {
        synthParamConfig.forEach((p) => {
            const current = (data as Record<string, unknown>)[p.key];
            if (current == null)
                onParameterChange(id, p.key, p.default as number | string);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const numericKeys = synthParamConfig
        .filter((p) => p.type === "number")
        .map((p) => p.key);
    const stringKeys = synthParamConfig
        .filter((p) => p.type === "select")
        .map((p) => p.key);

    const getValue = (key: SynthParamKey) =>
        (data as Record<string, unknown>)[key];

    return (
        <NodeUIProvider
            accentColor={accentColor}
            numericKeys={numericKeys}
            stringKeys={stringKeys}
        >
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
                        Synth
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
                    title="Synth"
                    description="Polyphonic synthesizer with basic subtractive controls."
                    inputs={
                        [
                            {
                                name: "MIDI In",
                                description:
                                    "Note input from a sequencer or MIDI device.",
                            },
                            {
                                name: "Preset",
                                description: "Select a preset patch.",
                            },
                            {
                                name: "Waveform",
                                description: "Oscillator waveform shape.",
                            },
                            {
                                name: "Attack/Decay/Sustain/Release",
                                description: "Envelope shaping for amplitude.",
                            },
                            {
                                name: "Cutoff/Resonance",
                                description: "Filter controls.",
                            },
                            {
                                name: "Glide",
                                description: "Portamento between notes.",
                            },
                            {
                                name: "Gain",
                                description: "Output level (0–1).",
                            },
                            {
                                name: "Max Voices",
                                description: "Polyphony limit.",
                            },
                        ] as HelpItem[]
                    }
                    outputs={
                        [
                            {
                                name: "Audio Out",
                                description: "Synthesizer audio output.",
                            },
                        ] as HelpItem[]
                    }
                />

                <div className="grid grid-cols-[minmax(16rem,_auto)_auto] gap-y-2 gap-x-4">
                    <div className="space-y-2 col-span-1">
                        <MidiInRow />
                        {synthParamConfig.map((cfg) => {
                            const prettyLabel =
                                cfg.key === "maxVoices"
                                    ? "Voices"
                                    : cfg.key.charAt(0).toUpperCase() +
                                      cfg.key.slice(1);
                            if (cfg.type === "select") {
                                return (
                                    <SelectParam
                                        key={cfg.key}
                                        nodeId={id}
                                        paramKey={cfg.key}
                                        label={prettyLabel}
                                        value={String(
                                            getValue(cfg.key) ?? cfg.default,
                                        )}
                                        options={[...cfg.options]}
                                        onParameterChange={
                                            onParameterChange as (
                                                nid: string,
                                                param: string,
                                                value: string,
                                            ) => void
                                        }
                                    />
                                );
                            }
                            return (
                                <NumberParam
                                    key={cfg.key}
                                    nodeId={id}
                                    paramKey={cfg.key}
                                    label={prettyLabel}
                                    value={Number(
                                        getValue(cfg.key) ?? cfg.default,
                                    )}
                                    min={cfg.min}
                                    max={cfg.max}
                                    step={cfg.step}
                                    onParameterChange={
                                        onParameterChange as (
                                            nid: string,
                                            param: string,
                                            value: number,
                                        ) => void
                                    }
                                />
                            );
                        })}
                    </div>
                    <div className="flex flex-col col-span-1">
                        <AudioOutRow />
                    </div>
                </div>
            </div>
            <HandleLayer />
        </NodeUIProvider>
    );
}

function MidiInRow() {
    const { midiEl } = useNodeUI();
    return (
        <div className="relative flex items-center" ref={(el) => midiEl(el)}>
            <label className={labelCls}>MIDI In</label>
            <span className="text-xs text-gray-400">
                Connect a sequencer or MIDI In
            </span>
        </div>
    );
}

function AudioOutRow() {
    const { outputEl } = useNodeUI();
    return (
        <div
            className="relative flex items-center justify-end"
            ref={(el) => outputEl(el)}
        >
            <span className="text-xs text-gray-300 mr-2">Audio Out</span>
        </div>
    );
}
