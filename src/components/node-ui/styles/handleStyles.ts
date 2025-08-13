import React from "react";

export type HandleVariant = "midi" | "numeric" | "audio" | "string" | "bool";

export interface MakeHandleStyleArgs {
    top: number;
    side: "left" | "right";
    connected: boolean;
    variant: HandleVariant;
    accentColor: string;
    baseBg?: string;
}

export const baseBgDefault = "#111827";

export function makeHandleStyle({
    top,
    side,
    connected,
    variant,
    accentColor,
    baseBg = baseBgDefault,
}: MakeHandleStyleArgs): React.CSSProperties {
    // Match original container sizes to restore handle positions
    const size = variant === "audio" ? 18 : variant === "midi" ? 16 : 20;
    const topAdjust = 0; // container remains centered; inner SVG handles the shape
    const base: React.CSSProperties = {
        top: top + topAdjust,
        transform: "translateY(-50%)",
    [side]: -(size / 2),
        width: size,
        height: size,
        background: "transparent",
        border: "none",
        borderRadius: 0,
        boxShadow: "none",
        transition: "background 140ms, box-shadow 140ms, filter 140ms",
        cursor: "crosshair",
        position: "absolute",
        "--fill": (connected ? accentColor : baseBg) as string,
    } as React.CSSProperties;
    // Container remains unrotated for all variants; shapes drawn via inner SVG
    return base;
}

export function renderHandleInner(
    variant: HandleVariant,
    accentColor: string,
): React.ReactNode {
    if (variant === "audio") {
        return React.createElement(
            "svg",
            {
                width: "100%",
                height: "100%",
                viewBox: "0 0 100 100",
                preserveAspectRatio: "xMidYMid meet",
                style: { pointerEvents: "none" },
            },
            React.createElement("circle", {
                cx: 50,
                cy: 50,
                r: 44,
                fill: "var(--fill)",
                stroke: accentColor,
                strokeWidth: 6,
            }),
        );
    }
    if (variant === "midi") {
            return React.createElement(
                "svg",
                {
                    width: "100%",
                    height: "100%",
                    viewBox: "0 0 100 100",
                    preserveAspectRatio: "xMidYMid meet",
                    style: { pointerEvents: "none" },
                },
                React.createElement("rect", {
                    x: 10,
                    y: 10,
                    width: 80,
                    height: 80,
                    fill: "var(--fill)",
                    stroke: accentColor,
                    strokeWidth: 6,
                }),
            );
    }
    if (variant === "numeric") {
        return React.createElement(
            "svg",
            {
                width: "100%",
                height: "100%",
                viewBox: "0 0 100 100",
                preserveAspectRatio: "xMidYMid meet",
                style: { pointerEvents: "none" },
            },
            React.createElement("polygon", {
                points: "50,5 95,50 50,95 5,50",
                fill: "var(--fill)",
                stroke: accentColor,
                strokeWidth: 7,
                strokeLinejoin: "round",
            }),
        );
    }
    if (variant === "string") {
        return React.createElement(
            "svg",
            {
                width: "100%",
                height: "100%",
                viewBox: "0 0 100 100",
                preserveAspectRatio: "xMidYMid meet",
                style: { pointerEvents: "none" },
            },
            React.createElement("polygon", {
                points: "50,6 94,38 76,94 24,94 6,38",
                fill: "var(--fill)",
                stroke: accentColor,
                strokeWidth: 6,
                strokeLinejoin: "round",
            }),
        );
    }
    if (variant === "bool") {
        return React.createElement(
            "svg",
            {
                width: "100%",
                height: "100%",
                viewBox: "0 0 100 100",
                preserveAspectRatio: "xMidYMid meet",
                style: { pointerEvents: "none" },
            },
            React.createElement("polygon", {
                // Slightly taller & wider than previous triangle
                points: "50,10 6,90 94,90",
                fill: "var(--fill)",
                stroke: accentColor,
                strokeWidth: 5,
                strokeLinejoin: "round",
            }),
        );
    }
    return null;
}
