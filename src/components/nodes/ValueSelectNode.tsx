"use client";

import React from "react";
import { List } from "lucide-react";
import { getNodeMeta } from "@/lib/nodeRegistry";
import { NodeUIProvider, useNodeUI } from "../node-ui/NodeUIProvider";
import { HandleLayer } from "../node-ui/HandleLayer";
import { SelectParam } from "../node-ui/params/SelectParam";
// import { ParamRow } from "../node-ui/ParamRow";
import NodeHelpPopover, { HelpItem } from "../node-ui/NodeHelpPopover";

interface ValueSelectNodeProps {
    id: string;
    selected?: boolean;
    data: {
        value?: string;
        options?: string;
        onParameterChange: (
            nodeId: string,
            parameter: string,
            value: string,
        ) => void;
    };
}

export default function ValueSelectNode({ id, data, selected }: ValueSelectNodeProps) {
    const { accentColor } = getNodeMeta("value-select");
    const { onParameterChange } = data;
    const isConnected = (data as unknown as { isParamConnected?: (k: string) => boolean }).isParamConnected;
    const _connectedParams = (data as unknown as { _connectedParams?: string[] })._connectedParams;
    const [helpOpen, setHelpOpen] = React.useState(false);
    const helpBtnRef = React.useRef<HTMLButtonElement | null>(null);

    React.useEffect(() => {
        const D = data as Record<string, unknown>;
        if (D.value == null) onParameterChange(id, "value", "");
        if (D.options == null) onParameterChange(id, "options", "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const get = (k: string) => (data as Record<string, unknown>)[k];

    const optionsCsv = String(get("options") ?? "");
    const optionsList = optionsCsv
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    // no local text inputs; selection is handled via SelectParam

    return (
    <NodeUIProvider accentColor={accentColor} stringKeys={["value"]} isParamConnected={(k) => Array.isArray(_connectedParams) ? _connectedParams.includes(k) : !!isConnected?.(k)}>
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
                    <List className="w-4 h-4 -translate-y-0.5" style={{ color: accentColor }} />
                    <span className="title-font text-base" style={{ color: accentColor }}>
                        Select
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
                    title="Select"
                    description="Dropdown string value. Accepts incoming string param to override local selection. Provide options via the 'options' string input handle (e.g., 'A, B, C')."
                    inputs={[
                        { name: "Value (string)", description: "Optional param input. Overrides local control when connected." },
                        { name: "Options (string)", description: "Comma-separated string like 'A, B, C' connected into the 'options' input." },
                    ] as HelpItem[]}
                    outputs={[
                        { name: "Param Out", description: "String value for connected targets." },
                    ] as HelpItem[]}
                />

                <div className="grid grid-cols-[minmax(16rem,_auto)_auto] gap-y-2 gap-x-4">
                    <div className="space-y-2 col-span-1">
                        <SelectParam
                            nodeId={id}
                            paramKey="value"
                            label="Value"
                            value={String(get("value") ?? "")}
                            options={optionsList}
                            onParameterChange={onParameterChange}
                            widthClass="w-40"
                            disabled={optionsList.length === 0}
                        />
                        {/* Options are provided via connection to 'options' param; no manual CSV input */}
                    </div>
                    <div className="flex flex-col col-span-1">
                        <OutputRow label="Param Out" />
                    </div>
                </div>
            </div>
            <HandleLayer includeMidiIn={false} includeParamTargets outputVariant="string" />
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
