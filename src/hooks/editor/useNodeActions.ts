"use client";
import { useCallback, useRef } from "react";
import { Node, Edge, ReactFlowInstance } from "reactflow";

type SendMidi = (
    sourceId: string,
    events: Array<{ data: [number, number, number]; atFrame?: number; atTimeMs?: number }>,
) => void;

type GenerateNodeId = () => string;
type SetNodes = React.Dispatch<React.SetStateAction<Node[]>>;
type SetEdges = React.Dispatch<React.SetStateAction<Edge[]>>;
type OnParameterChange = (nodeId: string, parameter: string, value: unknown) => void;
type OnEmitMidi = (sourceId: string, events: Array<{ data: [number, number, number]; atFrame?: number; atTimeMs?: number }>) => void;

interface UseNodeActionsOptions {
    sendMIDI: SendMidi;
    generateNodeId: GenerateNodeId;
    setNodes: SetNodes;
    setEdges: SetEdges;
    rfInstanceRef: React.RefObject<ReactFlowInstance | null>;
    handleParameterChange: OnParameterChange;
    handleEmitMidi: OnEmitMidi;
}

/** Node geometry helpers */
function getViewportCenter(rfInstanceRef: React.RefObject<ReactFlowInstance | null>) {
    const inst = rfInstanceRef.current;
    if (!inst) return { x: 0, y: 0 };

    // Attempt to find the wrapper element for better center calculation
    const container = (inst as { wrapper?: HTMLDivElement }).wrapper || (document.querySelector(".react-flow") as HTMLDivElement | null);
    const rect = container?.getBoundingClientRect();
    const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;

    // Use the latest screenToFlowPosition if available (React Flow >= 11.10)
    const instAny = inst as { screenToFlowPosition?: (p: { x: number; y: number }) => { x: number; y: number } };
    const screenToFlow = instAny.screenToFlowPosition;
    if (typeof screenToFlow === "function") return screenToFlow({ x: cx, y: cy });

    // Fallback for older versions
    return inst.project({ x: cx, y: cy });
}

function getSelectionCentroid(nodesList: Node[]) {
    if (!nodesList.length) return { x: 0, y: 0 };
    const sx = nodesList.reduce((acc, n) => acc + (n.position?.x || 0), 0);
    const sy = nodesList.reduce((acc, n) => acc + (n.position?.y || 0), 0);
    return { x: sx / nodesList.length, y: sy / nodesList.length };
}

/**
 * Node actions: add-node, MIDI emit handler, copy/paste/duplicate.
 */
export function useNodeActions({
    sendMIDI,
    generateNodeId,
    setNodes,
    setEdges,
    rfInstanceRef,
    handleParameterChange,
    handleEmitMidi,
}: UseNodeActionsOptions) {
    const nodesRef = useRef<Node[]>([]);
    const edgesRef = useRef<Edge[]>([]);
    const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
    const pasteBumpRef = useRef<number>(0);

    // Expose stable refs for use in keyboard handler without stale closures
    const syncRefs = useCallback((nodes: Node[], edges: Edge[]) => {
        nodesRef.current = nodes;
        edgesRef.current = edges;
    }, []);

    const handleEmitMidiCb = useCallback(
        (sourceId: string, events: Array<{ data: [number, number, number]; atFrame?: number; atTimeMs?: number }>) => {
            sendMIDI(sourceId, events);
        },
        [sendMIDI],
    );

    const onAddNode = useCallback(
        (type: string) => {
            if (type === "camera-hands" && nodesRef.current.some(n => n.type === "camera-hands")) {
                alert("Only one Camera Hands node can be added to the project to conserve resources.");
                return;
            }
            const pos = getViewportCenter(rfInstanceRef);
            const newNode: Node = {
                id: generateNodeId(),
                type,
                position: pos,
                data: (() => {
                    const base: Record<string, unknown> = { onParameterChange: handleParameterChange };
                    if (["sequencer", "arpeggiator", "midi-input"].includes(type)) base.onEmitMidi = handleEmitMidi;
                    return base;
                })(),
                selected: true,
            };
            setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), newNode]);
        },
        [generateNodeId, setNodes, handleParameterChange, handleEmitMidi, rfInstanceRef],
    );

    const getSelectedGraph = useCallback(() => {
        const selectedNodes = nodesRef.current.filter(n => n.selected);
        const selectedIds = new Set(selectedNodes.map(n => n.id));
        const selectedEdges = edgesRef.current.filter(e => selectedIds.has(e.source) && selectedIds.has(e.target));
        return { selectedNodes, selectedEdges };
    }, []);

    const duplicateGraph = useCallback(
        (nodesToCopy: Node[], edgesToCopy: Edge[], centerInViewport: boolean) => {
            let cameraCount = nodesRef.current.filter(n => n.type === "camera-hands").length;
            const validNodesToCopy = nodesToCopy.filter(n => {
                if (n.type === "camera-hands") {
                    if (cameraCount > 0) return false;
                    cameraCount++;
                }
                return true;
            });
            if (!validNodesToCopy.length) return;

            const idMap = new Map<string, string>();
            validNodesToCopy.forEach(n => idMap.set(n.id, generateNodeId()));
            const centerTarget = centerInViewport ? getViewportCenter(rfInstanceRef) : null;
            const centroid = getSelectionCentroid(validNodesToCopy);
            const bump = centerInViewport ? 0 : ((pasteBumpRef.current = (pasteBumpRef.current + 1) % 5), 24 + 6 * pasteBumpRef.current);
            const newNodes: Node[] = validNodesToCopy.map(n => {
                const delta = { x: (n.position?.x || 0) - centroid.x, y: (n.position?.y || 0) - centroid.y };
                const base = centerInViewport && centerTarget
                    ? { x: centerTarget.x + delta.x, y: centerTarget.y + delta.y }
                    : { x: (n.position?.x || 0) + bump, y: (n.position?.y || 0) + bump };
                return {
                    ...n,
                    id: idMap.get(n.id)!,
                    position: base,
                    selected: true,
                    data: { ...n.data }
                } as Node;
            });
            const newEdges: Edge[] = edgesToCopy
                .map(e => {
                    const s = idMap.get(e.source);
                    const t = idMap.get(e.target);
                    if (!s || !t) return null;
                    return { ...e, id: `${s}-${t}-${e.sourceHandle || ""}-${e.targetHandle || ""}-${Math.random().toString(36).slice(2, 8)}`, source: s, target: t } as Edge;
                })
                .filter(Boolean) as Edge[];
            setNodes(prev => [...prev.map(n => ({ ...(n as Node), selected: false } as Node)), ...newNodes]);
            setEdges(prev => [...prev, ...newEdges]);
        },
        [generateNodeId, setNodes, setEdges, rfInstanceRef],
    );

    const duplicateSelection = useCallback(
        (centerInViewport: boolean) => {
            const { selectedNodes, selectedEdges } = getSelectedGraph();
            duplicateGraph(selectedNodes, selectedEdges, centerInViewport);
        },
        [getSelectedGraph, duplicateGraph],
    );

    return {
        handleEmitMidiCb,
        onAddNode,
        getSelectedGraph,
        duplicateGraph,
        duplicateSelection,
        clipboardRef,
        syncRefs,
        nodesRef,
        edgesRef,
    };
}
