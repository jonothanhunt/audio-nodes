"use client";
import { useCallback, useEffect, useRef } from "react";
import { Node, Edge } from "reactflow";
import { AudioManager } from "@core-audio/client/audioManager";

interface UseNodeSyncOptions {
    nodes: Node[];
    edges: Edge[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    audioManager: AudioManager;
}

/**
 * Keeps the audio worklet in sync with the React graph state:
 * - Pushes node updates to the worklet whenever `nodes` changes
 * - Removes nodes from the worklet when they are deleted
 * - Pushes connection updates to the worklet whenever `edges` changes
 * - Reattaches handler callbacks whenever they change
 */
export function useNodeSync({
    nodes,
    edges,
    setNodes,
    audioManager,
}: UseNodeSyncOptions) {
    const prevNodeIdsRef = useRef<Set<string>>(new Set());

    // Sync nodes to worklet (updates and removals)
    useEffect(() => {
        const currentIds = new Set(nodes.map(n => n.id));
        const prevIds = prevNodeIdsRef.current;
        for (const id of prevIds) {
            if (!currentIds.has(id)) {
                try { audioManager.removeNode(id); } catch { }
            }
        }
        nodes.forEach(node => {
            if (node.data && node.type) {
                audioManager.updateNode(node.id, { type: node.type, ...node.data });
            }
        });
        prevNodeIdsRef.current = currentIds;
    }, [nodes, audioManager]);

    // Sync connections to worklet whenever edges change
    useEffect(() => {
        const connections = edges.map(edge => ({
            from: edge.source,
            to: edge.target,
            fromOutput: edge.sourceHandle || "output",
            toInput: edge.targetHandle || "input",
        }));
        audioManager.updateConnections(connections);
    }, [edges, audioManager]);

    // Reattach handler callbacks whenever they change
    const reattachHandlers = useCallback(
        (
            data: Record<string, unknown> | undefined,
            onParameterChange: (...args: unknown[]) => void,
            onEmitMidi: (...args: unknown[]) => void,
        ): Record<string, unknown> => ({
            ...(data || {}),
            onParameterChange,
            onEmitMidi,
        }),
        [],
    );

    const attachHandlers = useCallback(
        (
            onParameterChange: (...args: unknown[]) => void,
            onEmitMidi: (...args: unknown[]) => void,
        ) => {
            setNodes(nds =>
                nds.map(node => ({
                    ...node,
                    data: { ...node.data, onParameterChange, onEmitMidi },
                }))
            );
        },
        [setNodes],
    );

    return { reattachHandlers, attachHandlers };
}
