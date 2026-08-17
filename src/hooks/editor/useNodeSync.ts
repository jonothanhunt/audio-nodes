"use client";
import { useCallback, useEffect, useRef } from "react";
import { Node, Edge } from "@xyflow/react";
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
/**
 * Cheap comparison key for the parts of a node the audio engine cares about.
 *
 * Position, selection and drag state are deliberately excluded, as are the injected
 * `onParameterChange` / `onEmitMidi` callbacks (new function identities every render).
 * Without this the effect below pushed every node in the graph to the worklet on every
 * React Flow change — and React Flow emits a change per pointer-move while dragging, so a
 * 20-node graph produced well over a thousand deep-cloned postMessages per second and made
 * the audio crackle whenever the canvas was touched.
 */
function audioDataSignature(type: string, data: Record<string, unknown>): string {
    const keys = Object.keys(data).sort();
    let sig = type;
    for (const key of keys) {
        const value = data[key];
        if (typeof value === 'function') continue;
        sig += `|${key}=`;
        sig += typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
    }
    return sig;
}

export function useNodeSync({
    nodes,
    edges,
    setNodes,
    audioManager,
}: UseNodeSyncOptions) {
    const prevSignaturesRef = useRef<Map<string, string>>(new Map());

    // Sync nodes to worklet (updates and removals)
    useEffect(() => {
        const prevSignatures = prevSignaturesRef.current;
        const nextSignatures = new Map<string, string>();

        for (const node of nodes) {
            if (!node.data || !node.type) continue;
            const signature = audioDataSignature(node.type, node.data);
            nextSignatures.set(node.id, signature);
            if (prevSignatures.get(node.id) === signature) continue; // position-only change
            audioManager.updateNode(node.id, { type: node.type, ...node.data });
        }

        for (const id of prevSignatures.keys()) {
            if (!nextSignatures.has(id)) {
                try { audioManager.removeNode(id); } catch { }
            }
        }

        prevSignaturesRef.current = nextSignatures;
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
