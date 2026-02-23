import React from "react";
import { Handle, Position, useEdges } from "reactflow";
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
        nodeId,
    } = useNodeUI();

    const edges = useEdges();

    const isHandleConnected = (handleId: string, type: 'source' | 'target') => {
        return edges.some(e =>
            (type === 'target' && e.target === nodeId && e.targetHandle === handleId) ||
            (type === 'source' && e.source === nodeId && e.sourceHandle === handleId)
        );
    };
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
                        connected: isHandleConnected(inputHandleId, 'target'),
                        variant: inputHandleVariant,
                        accentColor,
                        baseBg,
                    })}
                    data-connected={isHandleConnected(inputHandleId, 'target')}
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
                            connected: isHandleConnected(key, 'target'),
                            variant,
                            accentColor,
                            baseBg,
                        })}
                        data-connected={isHandleConnected(key, 'target')}
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
                            connected: isHandleConnected(id, 'source'),
                            variant: variant,
                            accentColor,
                            baseBg,
                        })}
                        data-connected={isHandleConnected(id, 'source')}
                    >
                        {renderHandleInner(variant, accentColor)}
                    </Handle>
                );
            })}
        </>
    );
}
