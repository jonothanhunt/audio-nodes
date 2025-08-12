"use client";
import React from "react";
import { ParamRow } from "../ParamRow";

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
    const stop = (e: React.SyntheticEvent) => {
        e.stopPropagation();
    };
    return (
        <ParamRow label={label} paramKey={paramKey}>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onParameterChange(nodeId, paramKey, !value);
                }}
                onPointerDown={stop}
                onMouseDown={stop}
                className={`w-16 h-7 rounded border text-xs select-none nodrag flex items-center justify-center transition-colors ${value ? "bg-green-600 border-green-500 text-white" : "bg-gray-800 border-gray-600 text-gray-300"}`}
            >
                {value ? "On" : "Off"}
            </button>
        </ParamRow>
    );
}
