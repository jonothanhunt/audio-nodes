"use client";
import React from "react";
import { Handle, Position } from "reactflow";
import { useNodeUI } from "./NodeUIProvider";
import {
    makeHandleStyle,
    renderHandleInner,
    HandleVariant,
} from "./styles/handleStyles";

interface HandleLayerProps {
    outputId?: string | null;
    includeMidiIn?: boolean;
    inputHandleVariant?: HandleVariant; // variant for the top input slot (default midi)
    inputHandleId?: string; // id override (default 'midi')
    outputVariant?: HandleVariant; // variant for the right-side output (default 'audio')
}

export function HandleLayer({
    outputId = "output",
    includeMidiIn = true,
    inputHandleVariant = "midi",
    inputHandleId = "midi",
    outputVariant = "audio",
}: HandleLayerProps) {
    const {
        accentColor,
        paramTops,
        midiTop,
        outputTop,
        getVariantFor,
        baseBg,
    } = useNodeUI();

    return (
        <>
            {includeMidiIn && (
                <Handle
                    type="target"
                    position={Position.Left}
                    id={inputHandleId}
                    className="react-flow__handle"
                    style={makeHandleStyle({
                        top: midiTop,
                        side: "left",
                        connected: false,
                        variant: inputHandleVariant,
                        accentColor,
                    })}
                    onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background =
                            accentColor;
                    }}
                    onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background =
                            baseBg;
                    }}
                />
            )}
            {Object.entries(paramTops).map(([key, top]) => {
                const variant = getVariantFor(key);
                return (
                    <Handle
                        key={key}
                        type="target"
                        position={Position.Left}
                        id={key}
                        className="react-flow__handle"
                        style={makeHandleStyle({
                            top,
                            side: "left",
                            connected: false,
                            variant,
                            accentColor,
                        })}
                        onMouseEnter={(e) => {
                            if (variant === "string" || variant === "bool") {
                                (
                                    e.currentTarget as HTMLElement
                                ).style.setProperty("--fill", accentColor);
                            } else {
                                (
                                    e.currentTarget as HTMLElement
                                ).style.background = accentColor;
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (variant === "string" || variant === "bool") {
                                (
                                    e.currentTarget as HTMLElement
                                ).style.setProperty("--fill", baseBg);
                            } else {
                                (
                                    e.currentTarget as HTMLElement
                                ).style.background = baseBg;
                            }
                        }}
                    >
                        {renderHandleInner(variant, accentColor)}
                    </Handle>
                );
            })}
            {outputId && (
                <Handle
                    type="source"
                    position={Position.Right}
                    id={outputId}
                    className="react-flow__handle"
                    style={makeHandleStyle({
                        top: outputTop,
                        side: "right",
                        connected: false,
                        variant: outputVariant,
                        accentColor,
                    })}
                    onMouseEnter={(e) => {
                        if (
                            outputVariant === "string" ||
                            outputVariant === "bool"
                        ) {
                            (e.currentTarget as HTMLElement).style.setProperty(
                                "--fill",
                                accentColor,
                            );
                        } else {
                            (e.currentTarget as HTMLElement).style.background =
                                accentColor;
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (
                            outputVariant === "string" ||
                            outputVariant === "bool"
                        ) {
                            (e.currentTarget as HTMLElement).style.setProperty(
                                "--fill",
                                baseBg,
                            );
                        } else {
                            (e.currentTarget as HTMLElement).style.background =
                                baseBg;
                        }
                    }}
                >
                    {renderHandleInner(outputVariant, accentColor)}
                </Handle>
            )}
        </>
    );
}
