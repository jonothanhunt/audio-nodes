"use client";

import React from "react";
import { Hash } from "lucide-react";
import { getNodeMeta } from "@/lib/nodeRegistry";
import { NodeUIProvider, useNodeUI } from "../node-ui/NodeUIProvider";
import { HandleLayer } from "../node-ui/HandleLayer";
import { NumberParam } from "../node-ui/params/NumberParam";
import { BooleanParam } from "../node-ui/params/BooleanParam";
import NodeHelpPopover, { HelpItem } from "../node-ui/NodeHelpPopover";

interface ValueNumberNodeProps {
    id: string;
    selected?: boolean;
    data: {
        value?: number;
        ranged?: boolean;
        min?: number;
        max?: number;
        step?: number;
        onParameterChange: (
            nodeId: string,
            parameter: string,
            value: number | boolean,
        ) => void;
    };
}

export default function ValueNumberNode({ id, data, selected }: ValueNumberNodeProps) {
    const { accentColor } = getNodeMeta("value-number");
    const { onParameterChange } = data as unknown as {
        onParameterChange: (nid: string, key: string, v: number | boolean) => void;
    };
    const isConnected = (data as unknown as { isParamConnected?: (k: string) => boolean }).isParamConnected;
    const _connectedParams = (data as unknown as { _connectedParams?: string[] })._connectedParams;
    const [helpOpen, setHelpOpen] = React.useState(false);
    const helpBtnRef = React.useRef<HTMLButtonElement | null>(null);

    // Ensure defaults
    React.useEffect(() => {
        const D = data as Record<string, unknown>;
        if (D.value == null) onParameterChange(id, "value", 0);
        if (D.ranged == null) onParameterChange(id, "ranged", false as unknown as number);
        if (D.min == null) onParameterChange(id, "min", 0);
        if (D.max == null) onParameterChange(id, "max", 100);
        if (D.step == null) onParameterChange(id, "step", 1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const get = (k: string) => (data as Record<string, unknown>)[k];

    const ranged = Boolean(get("ranged") ?? false);
    const min = Number(get("min") ?? 0);
    const max = Number(get("max") ?? 100);
    const step = Number(get("step") ?? 1);

    return (
    <NodeUIProvider accentColor={accentColor} numericKeys={["value", "min", "max", "step"]} boolKeys={["ranged"]} isParamConnected={(k) => Array.isArray(_connectedParams) ? _connectedParams.includes(k) : !!isConnected?.(k)}>
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
                    <Hash className="w-4 h-4 -translate-y-0.5" style={{ color: accentColor }} />
                    <span className="title-font text-base" style={{ color: accentColor }}>
                        Number
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
                    title="Number"
                    description="Numeric value node with optional range and slider. Accepts an incoming numeric param to override local value."
                    inputs={[
                        { name: "Value (number)", description: "Optional param input. Overrides local control when connected." },
                        { name: "Range controls", description: "Min, Max, Step configure the slider when 'Use Range' is enabled." },
                    ] as HelpItem[]}
                    outputs={[
                        { name: "Param Out", description: "Numeric value for connected targets." },
                    ] as HelpItem[]}
                />

                <div className="grid grid-cols-[minmax(16rem,_auto)_auto] gap-y-2 gap-x-4">
                    <div className="space-y-2 col-span-1">
                        <NumberParam
                            nodeId={id}
                            paramKey="value"
                            label="Value"
                            value={Number(get("value") ?? 0)}
                            min={ranged ? min : undefined}
                            max={ranged ? max : undefined}
                            step={ranged ? step : undefined}
                            onParameterChange={onParameterChange as unknown as (
                                nid: string,
                                key: string,
                                v: number,
                            ) => void}
                        />
                        <BooleanParam
                            nodeId={id}
                            paramKey="ranged"
                            label="Use Range"
                            value={ranged}
                            onParameterChange={(nid, key, v) =>
                                (onParameterChange as unknown as (
                                    nid: string,
                                    key: string,
                                    v: boolean,
                                ) => void)(nid, key, v)
                            }
                        />
                        {ranged && (
                            <>
                                <NumberParam
                                    nodeId={id}
                                    paramKey="min"
                                    label="Min"
                                    value={min}
                                    onParameterChange={onParameterChange as unknown as (
                                        nid: string,
                                        key: string,
                                        v: number,
                                    ) => void}
                                />
                                <NumberParam
                                    nodeId={id}
                                    paramKey="max"
                                    label="Max"
                                    value={max}
                                    onParameterChange={onParameterChange as unknown as (
                                        nid: string,
                                        key: string,
                                        v: number,
                                    ) => void}
                                />
                                <NumberParam
                                    nodeId={id}
                                    paramKey="step"
                                    label="Step"
                                    value={step}
                                    onParameterChange={onParameterChange as unknown as (
                                        nid: string,
                                        key: string,
                                        v: number,
                                    ) => void}
                                />
                            </>
                        )}
                    </div>
                    <div className="flex flex-col col-span-1">
                        <OutputRow label="Param Out" />
                    </div>
                </div>
            </div>
+            {/* right-side output uses numeric variant to draw diamond */}
            <HandleLayer includeMidiIn={false} includeParamTargets outputVariant="numeric" />
        </NodeUIProvider>
    );
}

function OutputRow({ label }: { label: string }) {
    const { outputEl } = useNodeUI();
    return (
    <div className="relative flex items-center justify-end h-8" ref={(el) => outputEl(el)}>
            <span className="text-xs text-gray-300 mr-2">{label}</span>
        </div>
    );
}
