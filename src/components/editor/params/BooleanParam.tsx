"use client";
import React from "react";
import { ParamRow } from "../ParamRow";
import { useNodeUI } from "../NodeUIProvider";
import { useLiveParamModulation } from "@/hooks/audio/useLiveParamModulation";

interface BooleanParamProps {
    nodeId: string;
    paramKey: string;
    label: string;
    value: boolean;
    onParameterChange: (
        nodeId: string,
        parameter: string,
        value: boolean,
    ) => void;
}

export function BooleanParam({
    nodeId,
    paramKey,
    label,
    value,
    onParameterChange,
}: BooleanParamProps) {
    const { isParamConnected } = useNodeUI();
    const connected = isParamConnected?.(paramKey) ?? false;
    // When connected, show the live modulated value from the worklet so the
    // button colour reflects the actual driven state even while disabled.
    const liveValue = useLiveParamModulation(nodeId, paramKey, connected);
    const displayValue = connected && typeof liveValue === 'boolean' ? liveValue : value;
    const stop = (e: React.SyntheticEvent) => {

        e.stopPropagation();
    };
    return (
        <ParamRow label={label} paramKey={paramKey}>
            <button
                disabled={connected}
                onClick={(e) => {
                    e.stopPropagation();
                    onParameterChange(nodeId, paramKey, !value);
                }}
                onPointerDown={stop}
                onMouseDown={stop}
                className={`w-16 h-7 rounded border text-xs select-none nodrag flex items-center justify-center transition-colors ${displayValue ? "bg-green-600 border-green-500 text-white" : "bg-gray-800 border-gray-600 text-gray-300"} ${connected ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-700"}`}
                style={{ pointerEvents: connected ? "none" : undefined }}
            >
                {displayValue ? "On" : "Off"}
            </button>
        </ParamRow>
    );
}
