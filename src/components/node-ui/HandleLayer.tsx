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
    includeMidiIn?: boolean;
    inputHandleVariant?: HandleVariant; // variant for the top input slot (default midi)
    inputHandleId?: string; // id override (default 'midi')
    includeParamTargets?: boolean; // render left-side param handles (default true)
    outputs?: Array<{ id: string; variant: HandleVariant }>; // descriptors for output handles to render
}

export function HandleLayer({
    includeMidiIn = true,
    inputHandleVariant = "midi",
    inputHandleId = "midi",
    includeParamTargets = true,
    outputs = [],
}: HandleLayerProps) {
    const {
        accentColor,
        paramTops,
        midiTop,
        outputTops,
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
            {outputs.map(({ id, variant }) => {
                const top = outputTops[id];
                if (top === undefined) return null; // not registered yet
                return (
                    <Handle
                        key={id}
                        type="source"
                        position={Position.Right}
                        id={id}
                        className="react-flow__handle"
                        style={makeHandleStyle({
                            top,
                            side: "right",
                            connected: false,
                            variant: variant,
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
        </>
    );
}
