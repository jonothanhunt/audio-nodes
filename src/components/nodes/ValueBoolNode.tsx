"use client";

import React from "react";
import { ToggleRight } from "lucide-react";
import { getNodeMeta } from "@/lib/nodeRegistry";
import { NodeUIProvider, useNodeUI } from "../node-ui/NodeUIProvider";
import { HandleLayer } from "../node-ui/HandleLayer";
import { BooleanParam } from "../node-ui/params/BooleanParam";
import NodeHelpPopover, { HelpItem } from "../node-ui/NodeHelpPopover";

interface ValueBoolNodeProps {
    id: string;
    selected?: boolean;
    data: {
        value?: boolean;
        onParameterChange: (
            nodeId: string,
            parameter: string,
            value: boolean,
        ) => void;
    };
}

export default function ValueBoolNode({ id, data, selected }: ValueBoolNodeProps) {
    const { accentColor } = getNodeMeta("value-bool");
    const { onParameterChange } = data;
    const isConnected = (data as unknown as { isParamConnected?: (k: string) => boolean }).isParamConnected;
    const [helpOpen, setHelpOpen] = React.useState(false);
    const helpBtnRef = React.useRef<HTMLButtonElement | null>(null);

    React.useEffect(() => {
        if ((data as Record<string, unknown>)["value"] == null) {
            onParameterChange(id, "value", false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const get = (k: string) => (data as Record<string, unknown>)[k];

    return (
    <NodeUIProvider accentColor={accentColor} boolKeys={["value"]} isParamConnected={(k) => !!isConnected?.(k)}>
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
                    <ToggleRight className="w-4 h-4 -translate-y-0.5" style={{ color: accentColor }} />
                    <span className="title-font text-base" style={{ color: accentColor }}>
                        Bool
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
                    title="Bool"
                    description="Boolean value node. Can accept a boolean input and pass it through to outputs, or use the local toggle when not connected."
                    inputs={[
                        { name: "Value (bool)", description: "Optional param input. Overrides local control when connected." },
                    ] as HelpItem[]}
                    outputs={[
                        { name: "Param Out", description: "Boolean value for connected targets." },
                    ] as HelpItem[]}
                />

                <div className="grid grid-cols-[minmax(16rem,_auto)_auto] gap-y-2 gap-x-4">
                    <div className="space-y-2 col-span-1">
                        <BooleanParam
                            nodeId={id}
                            paramKey="value"
                            label="Value"
                            value={Boolean(get("value") ?? false)}
                            onParameterChange={onParameterChange}
                        />
                    </div>
                    <div className="flex flex-col col-span-1">
                        <OutputRow label="Param Out" />
                    </div>
                </div>
            </div>
            <HandleLayer includeMidiIn={false} includeParamTargets outputVariant="bool" />
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
