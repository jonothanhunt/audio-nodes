"use client";
import React, { useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { ReactFlowProvider } from "reactflow";
import { useGraph } from "@/hooks/editor/useGraph";
import { useAudioEngine } from "@/hooks/audio/useAudioEngine";
import { useNodeSync } from "@/hooks/editor/useNodeSync";
import { useNodeActions } from "@/hooks/editor/useNodeActions";
import { useProjectPersistence } from "@/hooks/state/useProjectPersistence";
import type { ReactFlowInstance, Node, Edge } from "reactflow";

import { useMidiAccess } from "@/hooks/hardware/useMidiAccess";

const AudioNodesEditor = dynamic(() => import("@/components/editor/AudioNodesEditor"), {
    ssr: false,
});

export default function Home() {
    // 1. Core State
    const {
        nodes,
        setNodes,
        onNodesChange,
        edges,
        setEdges,
        onEdgesChange,
        onConnect,
        isValidConnection,
        generateNodeId,
    } = useGraph();
    const { audioManager, audioInitialized, initializeAudio, sendMIDI } = useAudioEngine();

    const rfInstanceRef = useRef<ReactFlowInstance | null>(null);

    // 2. Handlers
    const handleParameterChange = useCallback(
        (nodeId: string, parameter: string, value: string | number | boolean) => {
            setNodes(prev => prev.map(node => {
                if (node.id !== nodeId) return node;
                const newNode = { ...node, data: { ...node.data, [parameter]: value } };
                audioManager.updateNode(nodeId, { type: node.type || "unknown", ...newNode.data });
                return newNode;
            }));
        },
        [setNodes, audioManager],
    );

    const handleEmitMidi = useCallback(
        (sourceId: string, events: Array<{ data: [number, number, number]; atFrame?: number; atTimeMs?: number }>) => sendMIDI(sourceId, events),
        [sendMIDI],
    );

    // 3. Logic Hooks
    const { reattachHandlers, attachHandlers } = useNodeSync({ nodes, edges, setNodes, audioManager });

    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        attachHandlers(handleParameterChange as any, handleEmitMidi as any);
    }, [handleParameterChange, handleEmitMidi, attachHandlers]);

    const {
        onAddNode,
        getSelectedGraph,
        duplicateGraph,
        duplicateSelection,
        clipboardRef,
        syncRefs,
        nodesRef,
    } = useNodeActions({
        sendMIDI,
        generateNodeId,
        setNodes,
        setEdges,
        rfInstanceRef,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handleParameterChange: handleParameterChange as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handleEmitMidi: handleEmitMidi as any,
    });

    useEffect(() => { syncRefs(nodes, edges); }, [nodes, edges, syncRefs]);

    const reattachHandlersCb = useCallback(
        (data: Record<string, unknown> | undefined) =>
            reattachHandlers(
                data,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                handleParameterChange as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                handleEmitMidi as any,
            ),
        [reattachHandlers, handleParameterChange, handleEmitMidi],
    );

    const persistence = useProjectPersistence(nodes, edges, setNodes, setEdges, rfInstanceRef, reattachHandlersCb);

    // 4. Bootstrapping
    const didBootRef = useRef(false);
    useEffect(() => {
        if (didBootRef.current) return;
        didBootRef.current = true;
        const boot = async () => {
            const ok = persistence.loadFromLocalStorage({ ignoreViewport: true });
            if (ok) return;
            for (const url of ["/projects/default-project.json", "/default-project.json"]) {
                try {
                    const res = await fetch(`${url}?v=${Date.now()}`);
                    if (!res.ok) continue;
                    persistence.handleLoadFromObject(await res.json() as Record<string, unknown>, { ignoreViewport: true });
                    break;
                } catch { }
            }
        };
        void boot();
    }, [persistence]);

    // 5. Bridge events
    useEffect(() => {
        const off = audioManager.onSequencerStep((nodeId: string, stepIndex: number) => {
            try { window.dispatchEvent(new CustomEvent("audioNodesSequencerStep", { detail: { nodeId, stepIndex } })); } catch { }
        });
        return () => { try { off(); } catch { } };
    }, [audioManager]);

    // Web MIDI integration
    useMidiAccess(nodesRef, setNodes, sendMIDI);

    return (
        <ReactFlowProvider>
            <AudioNodesEditor
                // State
                nodes={nodes}
                edges={edges}
                audioInitialized={audioInitialized}
                audioManager={audioManager}
                // Graph Handlers
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                isValidConnection={isValidConnection}
                // Actions
                onAddNode={onAddNode}
                initializeAudio={initializeAudio}
                // Persistence
                persistence={persistence}
                // Instances
                rfInstanceRef={rfInstanceRef}
                // Node actions for keyboard shortcuts
                nodeActions={{
                    getSelectedGraph,
                    duplicateGraph: (nds: Node[], eds: Edge[], center: boolean) => duplicateGraph(nds, eds, center),
                    duplicateSelection: (center: boolean) => duplicateSelection(center),
                    clipboardRef,
                    nodesRef,
                }}
            />
        </ReactFlowProvider>
    );
}
