"use client";
import React from "react";
import { ParamRow } from "../ParamRow";
import { useNodeUI } from "../NodeUIProvider";
import { inputCls } from "../styles/inputStyles";

interface SelectParamProps {
    nodeId: string;
    paramKey: string;
    label: string;
    value: string;
    options: string[];
    onParameterChange: (
        nodeId: string,
        parameter: string,
        value: string,
    ) => void;
    widthClass?: string;
    disabled?: boolean;
}

export function SelectParam({
    nodeId,
    paramKey,
    label,
    value,
    options,
    onParameterChange,
    widthClass = "w-28",
    disabled,
}: SelectParamProps) {
    const stop = (e: React.SyntheticEvent) => {
        e.stopPropagation();
    };
    const { isParamConnected } = useNodeUI();
    const connected = isParamConnected?.(paramKey) ?? false;
    // Track last valid value so we can display it when incoming connected value is invalid
    const lastValidRef = React.useRef<string | null>(null);
    const opts = Array.isArray(options) ? options : [];
    const isValid = opts.includes(value);
    React.useEffect(() => {
        if (isValid) {
            lastValidRef.current = value;
        } else if (lastValidRef.current == null && opts.length > 0) {
            // Initialize with first option to avoid empty select value
            lastValidRef.current = opts[0];
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, options]);
    const invalidIncoming = connected && !isValid;
    const disabledComputed = connected || !!disabled;
    const displayValue = invalidIncoming
        ? lastValidRef.current ?? (opts[0] ?? "")
        : value;
    return (
        <ParamRow label={label} paramKey={paramKey}>
            <select
                value={displayValue}
                disabled={disabledComputed}
                onChange={(e) => {
                    e.stopPropagation();
                    if (disabledComputed) return; // safety guard
                    onParameterChange(nodeId, paramKey, e.target.value);
                }}
                onPointerDown={stop}
                onMouseDown={stop}
                onClick={stop}
                onDoubleClick={stop}
                aria-invalid={invalidIncoming || undefined}
                title={invalidIncoming ? "Incoming value not in options" : undefined}
                className={`${inputCls} ${widthClass} nodrag ${disabledComputed ? "cursor-not-allowed opacity-60" : ""} ${invalidIncoming ? "border-red-500" : ""}`}
                style={{
                    pointerEvents: disabledComputed ? "none" : undefined,
                    borderColor: invalidIncoming ? "#ef4444" : undefined,
                    outlineColor: invalidIncoming ? "#ef4444" : undefined,
                }}
            >
                {options.map((o) => (
                    <option key={o} value={o}>
                        {o}
                    </option>
                ))}
            </select>
        </ParamRow>
    );
}
