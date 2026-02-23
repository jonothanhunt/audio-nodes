"use client";
import React from "react";
import { ParamRow } from "../ParamRow";
import { inputCls } from "../styles/inputStyles";
import { useNodeUI } from "../NodeUIProvider";

interface SelectParamProps {
    nodeId: string;
    paramKey: string;
    label: string;
    value: string;
    options: Array<string | { label: string; value: string }>;
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
    const { isParamConnected } = useNodeUI();
    const stop = (e: React.SyntheticEvent) => {
        e.stopPropagation();
    };
    // Track last valid value so we can display it when incoming connected value is invalid
    const lastValidRef = React.useRef<string | null>(null);
    const opts = React.useMemo(() => Array.isArray(options) ? options.map(o => typeof o === 'string' ? o : o.value) : [], [options]);
    const isValid = opts.includes(value);

    React.useEffect(() => {
        if (isValid) {
            lastValidRef.current = value;
        } else if (lastValidRef.current == null && opts.length > 0) {
            // Initialize with first option to avoid empty select value
            lastValidRef.current = opts[0];
        }
    }, [value, isValid, opts]);
    const invalidIncoming = !isValid;
    const disabledComputed = !!disabled || (isParamConnected?.(paramKey) ?? false);
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
                {options.map((o) => {
                    const val = typeof o === 'string' ? o : o.value;
                    const lbl = typeof o === 'string' ? o : o.label;
                    return (
                        <option key={val} value={val}>
                            {lbl}
                        </option>
                    );
                })}
            </select>
        </ParamRow>
    );
}
