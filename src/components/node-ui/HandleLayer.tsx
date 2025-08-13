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
    includeParamTargets?: boolean; // render left-side param handles (default true)
}

export function HandleLayer({
    outputId = "output",
    includeMidiIn = true,
    inputHandleVariant = "midi",
    inputHandleId = "midi",
    outputVariant = "audio",
    includeParamTargets = true,
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
                        baseBg,
                    })}
                    onMouseEnter={(e) => {
                        (
                            e.currentTarget as HTMLElement
                        ).style.setProperty("--fill", accentColor);
                    }}
                    onMouseLeave={(e) => {
                        (
                            e.currentTarget as HTMLElement
                        ).style.setProperty("--fill", baseBg);
                    }}
                >
                    {renderHandleInner(inputHandleVariant, accentColor)}
                </Handle>
            )}
            {includeParamTargets && Object.entries(paramTops).map(([key, top]) => {
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
                            baseBg,
                        })}
                        onMouseEnter={(e) => {
                            (
                                e.currentTarget as HTMLElement
                            ).style.setProperty("--fill", accentColor);
                        }}
                        onMouseLeave={(e) => {
                            (
                                e.currentTarget as HTMLElement
                            ).style.setProperty("--fill", baseBg);
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
                        baseBg,
                    })}
                    onMouseEnter={(e) => {
                        (
                            e.currentTarget as HTMLElement
                        ).style.setProperty("--fill", accentColor);
                    }}
                    onMouseLeave={(e) => {
                        (
                            e.currentTarget as HTMLElement
                        ).style.setProperty("--fill", baseBg);
                    }}
                >
                    {renderHandleInner(outputVariant, accentColor)}
                </Handle>
            )}
        </>
    );
}
