"use client";

import React from "react";
import { Keyboard } from "lucide-react";
import { getNodeMeta } from "@/lib/nodeRegistry";
import { NodeUIProvider, useNodeUI } from "../node-ui/NodeUIProvider";
import { HandleLayer } from "../node-ui/HandleLayer";
import { labelCls, inputCls } from "../node-ui/styles/inputStyles";
import NodeHelpPopover, { HelpItem } from "../node-ui/NodeHelpPopover";

interface MidiInputNodeProps {
    id: string;
    selected?: boolean;
    data: {
        onParameterChange?: (
            nodeId: string,
            parameter: string,
            value: string | number | boolean,
        ) => void;
        onEmitMidi?: (
            sourceId: string,
            events: Array<{
                data: [number, number, number];
                atFrame?: number;
                atTimeMs?: number;
            }>,
        ) => void;
        deviceId?: string;
        channel?: number | "all";
        status?: string;
        devices?: Array<{ id: string; name: string }>;
        error?: string;
    };
}

const MidiInputNode: React.FC<MidiInputNodeProps> = ({
    id,
    data,
    selected,
}) => {
    const { accentColor } = getNodeMeta("midi-input");
    const {
        onParameterChange,
        deviceId = "",
        channel = "all",
        status,
        devices = [],
        error,
    } = data;

    const stop = (e: React.SyntheticEvent) => {
        e.stopPropagation();
    };
    const [helpOpen, setHelpOpen] = React.useState(false);
    const helpBtnRef = React.useRef<HTMLButtonElement | null>(null);

    return (
        <NodeUIProvider accentColor={accentColor}>
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
                {/* Header */}
                <div className="flex items-center gap-2 mb-3 relative">
                    <Keyboard
                        className="w-4 h-4 -translate-y-0.5"
                        style={{ color: accentColor }}
                    />
                    <span
                        className="title-font text-base"
                        style={{ color: accentColor }}
                    >
                        MIDI In
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
                    title="MIDI In"
                    description="Receives MIDI messages from a connected device. Optionally filter by channel."
                    inputs={
                        [
                            {
                                name: "Device",
                                description:
                                    "Select a specific MIDI input or use (All).",
                            },
                            {
                                name: "Channel",
                                description:
                                    "Limit to a single channel or receive All.",
                            },
                        ] as HelpItem[]
                    }
                    outputs={
                        [
                            {
                                name: "MIDI Out",
                                description:
                                    "Forwards received MIDI events to other nodes.",
                            },
                        ] as HelpItem[]
                    }
                />

                {/* Two-column, top-aligned layout: LEFT inputs, RIGHT outputs */}
                <div className="grid grid-cols-[minmax(16rem,_auto)_auto] gap-y-2 gap-x-4">
                    {/* LEFT: inputs (no handles) */}
                    <div className="space-y-2 col-span-1">
                        <div className="relative flex items-center h-8">
                            <label className={labelCls}>Device</label>
                            <select
                                className={`${inputCls} w-40 text-xs nodrag`}
                                value={deviceId}
                                onChange={(e) =>
                                    onParameterChange?.(
                                        id,
                                        "deviceId",
                                        e.target.value,
                                    )
                                }
                                onPointerDown={stop}
                                onMouseDown={stop}
                                onClick={stop}
                                onDoubleClick={stop}
                            >
                                <option value="">(All)</option>
                                {devices.map((d, idx) => {
                                    const optId = d.id || `dev-${idx}`;
                                    const label =
                                        d.name && d.name.trim().length > 0
                                            ? d.name
                                            : d.id && d.id.trim().length > 0
                                              ? d.id
                                              : `Device ${idx + 1}`;
                                    return (
                                        <option
                                            key={optId + "-" + idx}
                                            value={d.id}
                                        >
                                            {label}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>
                        <div className="relative flex items-center h-8">
                            <label className={labelCls}>Channel</label>
                            <select
                                className={`${inputCls} w-24 text-center nodrag`}
                                value={String(channel)}
                                onChange={(e) =>
                                    onParameterChange?.(
                                        id,
                                        "channel",
                                        e.target.value === "all"
                                            ? "all"
                                            : parseInt(e.target.value, 10),
                                    )
                                }
                                onPointerDown={stop}
                                onMouseDown={stop}
                                onClick={stop}
                                onDoubleClick={stop}
                            >
                                <option value="all">All</option>
                                {Array.from({ length: 16 }).map((_, i) => (
                                    <option key={i} value={i + 1}>
                                        {i + 1}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <StatusRow status={status} error={error} />
                    </div>

                    {/* RIGHT: outputs (top-aligned) */}
                    <div className="flex flex-col col-span-1">
                        <MidiOutRow />
                    </div>
                </div>
            </div>

            {/* Right-side MIDI Out handle (square) */}
            <HandleLayer
                includeMidiIn={false}
                outputId="midi"
                outputVariant="midi"
            />
        </NodeUIProvider>
    );
};

function MidiOutRow() {
    const { outputEl } = useNodeUI();
    return (
        <div
            className="relative flex items-center justify-end h-8"
            ref={(el) => outputEl(el)}
        >
            <span className="text-xs text-gray-300 mr-2">MIDI Out</span>
        </div>
    );
}

function StatusRow({ status, error }: { status?: string; error?: string }) {
    return (
    <div className="relative flex items-center h-8">
            <label className={labelCls}>Status</label>
            {status || error ? (
                <div
                    className={`text-xs ${
                        error ? "text-red-400" : "text-gray-400"
                    } truncate max-w-[7rem]`}
                >
                    {error || status}
                </div>
            ) : (
                <div className="text-xs text-gray-500">idle</div>
            )}
        </div>
    );
}

export default MidiInputNode;
