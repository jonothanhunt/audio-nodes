"use client";

import React, { useCallback } from "react";
import ReactFlow, {
    MiniMap,
    Background,
    BackgroundVariant,
    Node,
    Edge,
    ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";

import NodeLibrary from "@/components/NodeLibrary";
import OscillatorNode from "@/components/nodes/Synthesis/OscillatorNode";
import ReverbNode from "@/components/nodes/Effects/ReverbNode";
import SpeakerNode from "@/components/nodes/Utility/SpeakerNode";
import SequencerNode from "@/components/nodes/MIDI/SequencerNode";
import ArpeggiatorNode from "@/components/nodes/MIDI/ArpeggiatorNode";
import SynthesizerNode from "@/components/nodes/Synthesis/SynthesizerNode";
import MidiInputNode from "@/components/nodes/MIDI/MidiInputNode";
import SaveLoadPanel from "@/components/SaveLoadPanel";
import { useAudioEngine } from "@/hooks/useAudioEngine";
// nodes.ts removed – inline minimal initial data builder (handlers only; param defaults via NodeSpec)
import { useProjectPersistence } from "@/hooks/useProjectPersistence";
import { useGraph } from "@/hooks/useGraph";
import { useMidiAccess } from "@/hooks/useMidiAccess";
import MidiTransposeNode from "@/components/nodes/MIDI/MidiTransposeNode";
import GradientEdge from "@/components/edges/GradientEdge";
import { getNodeMeta } from "@/lib/nodeRegistry";
import type { OnConnectStartParams } from "reactflow";
import ValueBoolNode from "@/components/nodes/Value/ValueBoolNode";
import ValueNumberNode from "@/components/nodes/Value/ValueNumberNode";
import ValueTextNode from "@/components/nodes/Value/ValueTextNode";
import ValueSelectNode from "@/components/nodes/Value/ValueSelectNode";
import TransportPill from "@/components/TransportPill";
import LFONode from "@/components/nodes/Utility/LFONode";
import { ConnectedParamsProvider } from "@/components/node-ui/ConnectedParamsContext";

const nodeTypes = {
    oscillator: OscillatorNode,
    reverb: ReverbNode,
    speaker: SpeakerNode,
    sequencer: SequencerNode,
    arpeggiator: ArpeggiatorNode,
    synth: SynthesizerNode,
    "midi-input": MidiInputNode,
    "midi-transpose": MidiTransposeNode,
    "value-bool": ValueBoolNode,
    "value-number": ValueNumberNode,
    "value-text": ValueTextNode,
    "value-select": ValueSelectNode,
    lfo: LFONode,
};

const edgeTypes = { gradient: GradientEdge };

export default function AudioNodesEditor() {
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
    const { audioManager, audioInitialized, initializeAudio, sendMIDI } =
        useAudioEngine();
    // (Transport pill state moved to TransportPill component)

    // Bridge: dispatch sequencerStep events from audioManager to window so individual SequencerNode components can listen
    React.useEffect(() => {
        const off = audioManager.onSequencerStep((nodeId: string, stepIndex: number) => {
            try {
                const ev = new CustomEvent("audioNodesSequencerStep", { detail: { nodeId, stepIndex } });
                window.dispatchEvent(ev);
            } catch { }
        });
        return () => { try { off(); } catch { } };
    }, [audioManager]);

    // Listen for UI-triggered play/rate events from SequencerNode components and forward to audioManager
    React.useEffect(() => {
        const onPlayToggle = (e: Event) => {
            const detail = (e as CustomEvent).detail as { nodeId: string; play: boolean };
            if (!detail) return;
            audioManager.setSequencerPlay(detail.nodeId, detail.play);
        };
        const onRateChange = (e: Event) => {
            const detail = (e as CustomEvent).detail as { nodeId: string; rate: number };
            if (!detail) return;
            audioManager.setSequencerRate(detail.nodeId, detail.rate);
        };
        const onArpPlay = (e: Event) => {
            const detail = (e as CustomEvent).detail as { nodeId: string; play: boolean };
            if (!detail) return;
            audioManager.setArpPlay(detail.nodeId, detail.play);
        };
        const onArpRate = (e: Event) => {
            const detail = (e as CustomEvent).detail as { nodeId: string; rate: number };
            if (!detail) return;
            audioManager.setArpRate(detail.nodeId, detail.rate);
        };
        window.addEventListener("audioNodesSequencerPlayToggle", onPlayToggle as EventListener);
        window.addEventListener("audioNodesSequencerRateChange", onRateChange as EventListener);
        window.addEventListener("audioNodesArpPlayToggle", onArpPlay as EventListener);
        window.addEventListener("audioNodesArpRateChange", onArpRate as EventListener);
        return () => {
            window.removeEventListener("audioNodesSequencerPlayToggle", onPlayToggle as EventListener);
            window.removeEventListener("audioNodesSequencerRateChange", onRateChange as EventListener);
            window.removeEventListener("audioNodesArpPlayToggle", onArpPlay as EventListener);
            window.removeEventListener("audioNodesArpRateChange", onArpRate as EventListener);
        };
    }, [audioManager]);
    const rfInstanceRef = React.useRef<ReactFlowInstance | null>(null);
    const [connectingColor, setConnectingColor] = React.useState<string | null>(
        null
    );
    const prevNodeIdsRef = React.useRef<Set<string>>(new Set());
    const clipboardRef = React.useRef<{ nodes: Node[]; edges: Edge[] } | null>(
        null
    );
    const pasteBumpRef = React.useRef<number>(0);
    // Stable refs for current nodes/edges to avoid stale closures in callbacks
    const nodesRef = React.useRef(nodes);
    const edgesRef = React.useRef(edges);
    React.useEffect(() => {
        nodesRef.current = nodes;
    }, [nodes]);
    React.useEffect(() => {
        edgesRef.current = edges;
    }, [edges]);

    const handleConnectStart = useCallback(
        (_: unknown, params: OnConnectStartParams) => {
            const nid = params?.nodeId;
            if (!nid) {
                setConnectingColor(null);
                return;
            }
            const node = nodes.find((n) => n.id === nid);
            setConnectingColor(
                node ? getNodeMeta(node.type).accentColor : null
            );
        },
        [nodes]
    );
    const handleConnectEnd = useCallback(() => {
        setConnectingColor(null);
    }, []);


    // MIDI emit (Sequencer etc.)
    const handleEmitMidi = useCallback(
        (
            sourceId: string,
            events: Array<{
                data: [number, number, number];
                atFrame?: number;
                atTimeMs?: number;
            }>
        ) => {
            sendMIDI(sourceId, events);
        },
        [sendMIDI]
    );

    // Parameter change
    const handleParameterChange = useCallback(
        (
            nodeId: string,
            parameter: string,
            value: string | number | boolean
        ) => {
            setNodes((prev) => {
                return prev.map((node) => {
                    if (node.id !== nodeId) return node;
                    const newNode = {
                        ...node,
                        data: { ...node.data, [parameter]: value },
                    };
                    // sync to audio engine
                    audioManager.updateNode(nodeId, {
                        type: node.type || "unknown",
                        ...newNode.data,
                    });
                    return newNode;
                });
            });
        },
        [setNodes, audioManager]
    );

    // Sync nodes to worklet (updates and removals)
    React.useEffect(() => {
        // compute removals
        const currentIds = new Set(nodes.map((n) => n.id));
        const prevIds = prevNodeIdsRef.current;
        for (const id of prevIds) {
            if (!currentIds.has(id)) {
                try {
                    audioManager.removeNode(id);
                } catch { }
            }
        }
        // push updates
        nodes.forEach((node) => {
            if (node.data && node.type) {
                audioManager.updateNode(node.id, {
                    type: node.type,
                    ...node.data,
                });
            }
        });
        prevNodeIdsRef.current = currentIds;
    }, [nodes, audioManager]);

    // Sync connections to worklet whenever edges change
    React.useEffect(() => {
        const connections = edges.map((edge) => ({
            from: edge.source,
            to: edge.target,
            fromOutput: edge.sourceHandle || "output",
            toInput: edge.targetHandle || "input",
        }));
        audioManager.updateConnections(connections);
    }, [edges, audioManager]);


    // Attach handlers
    React.useEffect(() => {
        setNodes((nds) =>
            nds.map((node) => ({
                ...node,
                data: {
                    ...node.data,
                    onParameterChange: handleParameterChange,
                    onEmitMidi: handleEmitMidi,
                },
            }))
        );
    }, [handleParameterChange, handleEmitMidi, setNodes]);

    // Reattach for persistence
    const reattachHandlers = useCallback(
        (
            data: Record<string, unknown> | undefined
        ): Record<string, unknown> => ({
            ...(data || {}),
            onParameterChange: handleParameterChange,
            onEmitMidi: handleEmitMidi,
        }),
        [handleParameterChange, handleEmitMidi]
    );

    const {
        handleSaveClick,
        handleLoadFromObject,
        loadFromLocalStorage,
        handleLoadDefault,
    } = useProjectPersistence(
        nodes,
        edges,
        setNodes,
        setEdges,
        rfInstanceRef,
        reattachHandlers
    );

    // Autoload project
    const didBootRef = React.useRef(false);
    React.useEffect(() => {
        if (didBootRef.current) return;
        didBootRef.current = true;
        const boot = async () => {
            const ok = loadFromLocalStorage();
            if (ok) return;
            const candidates = [
                "/projects/default-project.json",
                "/default-project.json",
            ];
            for (const url of candidates) {
                try {
                    const res = await fetch(`${url}?v=${Date.now()}`);
                    if (!res.ok) continue;
                    const json = await res.json();
                    handleLoadFromObject(json as unknown);
                    break;
                } catch { }
            }
        };
        void boot();
        // intentionally run only once
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Add new node
    const onAddNode = useCallback(
        (type: string) => {
            const inst = rfInstanceRef.current;
            // Place in viewport center
            let pos = { x: 0, y: 0 };
            if (inst) {
                const container =
                    (inst as unknown as { wrapper?: HTMLDivElement }).wrapper ||
                    (document.querySelector(
                        ".react-flow"
                    ) as HTMLDivElement | null);
                const rect = container?.getBoundingClientRect();
                const cx = rect
                    ? rect.left + rect.width / 2
                    : window.innerWidth / 2;
                const cy = rect
                    ? rect.top + rect.height / 2
                    : window.innerHeight / 2;
                const screenToFlow = (
                    inst as unknown as {
                        screenToFlowPosition?: (p: {
                            x: number;
                            y: number;
                        }) => { x: number; y: number };
                    }
                ).screenToFlowPosition;
                if (typeof screenToFlow === "function")
                    pos = screenToFlow({ x: cx, y: cy });
                else pos = inst.project({ x: cx, y: cy });
            }
            const newNode: Node = {
                id: generateNodeId(),
                type,
                position: pos,
                data: (() => {
                    const base: Record<string, unknown> = { onParameterChange: handleParameterChange };
                    if (["sequencer", "arpeggiator", "midi-input"].includes(type)) {
                        base.onEmitMidi = handleEmitMidi;
                    }
                    return base;
                })(),
                selected: true,
            };
            setNodes((nds) => {
                // Clear previous selection and select the new node
                return [
                    ...nds.map((n) => ({ ...n, selected: false })),
                    newNode,
                ];
            });
        },
        [generateNodeId, setNodes, handleParameterChange, handleEmitMidi]
    );

    // Helpers for selection and geometry
    const getSelectedGraph = useCallback(() => {
        const selectedNodes = nodesRef.current.filter((n) => n.selected);
        const selectedIds = new Set(selectedNodes.map((n) => n.id));
        const selectedEdges = edgesRef.current.filter(
            (e) => selectedIds.has(e.source) && selectedIds.has(e.target)
        );
        return { selectedNodes, selectedEdges };
    }, []);

    const getViewportCenterFlow = useCallback(() => {
        const inst = rfInstanceRef.current;
        if (!inst) return { x: 0, y: 0 };
        const container =
            (inst as unknown as { wrapper?: HTMLDivElement }).wrapper ||
            (document.querySelector(".react-flow") as HTMLDivElement | null);
        const rect = container?.getBoundingClientRect();
        const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
        const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
        const screenToFlow = (
            inst as unknown as {
                screenToFlowPosition?: (p: { x: number; y: number }) => {
                    x: number;
                    y: number;
                };
            }
        ).screenToFlowPosition;
        if (typeof screenToFlow === "function")
            return screenToFlow({ x: cx, y: cy });
        return inst.project({ x: cx, y: cy });
    }, []);

    const getSelectionCentroid = (nodesList: Node[]) => {
        if (!nodesList.length) return { x: 0, y: 0 };
        const sx = nodesList.reduce((acc, n) => acc + (n.position?.x || 0), 0);
        const sy = nodesList.reduce((acc, n) => acc + (n.position?.y || 0), 0);
        return { x: sx / nodesList.length, y: sy / nodesList.length };
    };

    const duplicateGraph = useCallback(
        (
            nodesToCopy: Node[],
            edgesToCopy: Edge[],
            centerInViewport: boolean
        ) => {
            if (!nodesToCopy.length) return;
            const idMap = new Map<string, string>();
            nodesToCopy.forEach((n) => idMap.set(n.id, generateNodeId()));
            const centerTarget = centerInViewport
                ? getViewportCenterFlow()
                : null;
            const centroid = getSelectionCentroid(nodesToCopy);
            const bump = centerInViewport
                ? 0
                : ((pasteBumpRef.current = (pasteBumpRef.current + 1) % 5),
                    24 + 6 * pasteBumpRef.current);
            const newNodes: Node[] = nodesToCopy.map((n) => {
                const delta = {
                    x: (n.position?.x || 0) - centroid.x,
                    y: (n.position?.y || 0) - centroid.y,
                };
                const base =
                    centerInViewport && centerTarget
                        ? {
                            x: centerTarget.x + delta.x,
                            y: centerTarget.y + delta.y,
                        }
                        : {
                            x: (n.position?.x || 0) + bump,
                            y: (n.position?.y || 0) + bump,
                        };
                const clonedData = {
                    ...(n.data as unknown as Record<string, unknown>),
                } as unknown as Node["data"];
                return {
                    ...n,
                    id: idMap.get(n.id)!,
                    position: base,
                    selected: true,
                    data: clonedData,
                } as Node;
            });
            const newEdges: Edge[] = edgesToCopy
                .map((e) => {
                    const s = idMap.get(e.source);
                    const t = idMap.get(e.target);
                    if (!s || !t) return null;
                    return {
                        ...e,
                        id: `${s}-${t}-${e.sourceHandle || ""}-${e.targetHandle || ""
                            }-${Math.random().toString(36).slice(2, 8)}`,
                        source: s,
                        target: t,
                    } as Edge;
                })
                .filter(Boolean) as Edge[];
            setNodes((prev) => {
                const cleared = prev.map(
                    (n) => ({ ...(n as Node), selected: false } as Node)
                );
                return [...cleared, ...newNodes];
            });
            setEdges((prev) => [...prev, ...newEdges]);
        },
        [getViewportCenterFlow, generateNodeId, setNodes, setEdges]
    );

    const duplicateSelection = useCallback(
        (centerInViewport: boolean) => {
            const { selectedNodes, selectedEdges } = getSelectedGraph();
            duplicateGraph(selectedNodes, selectedEdges, centerInViewport);
        },
        [getSelectedGraph, duplicateGraph]
    );

    // Keyboard shortcuts: Copy, Paste, Duplicate
    React.useEffect(() => {
        const isEditableTarget = (el: EventTarget | null) => {
            const t = el as HTMLElement | null;
            if (!t) return false;
            const tag = (t.tagName || "").toLowerCase();
            if (["input", "textarea", "select"].includes(tag)) return true;
            if ((t as HTMLElement).isContentEditable) return true;
            return false;
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (isEditableTarget(e.target)) return;
            const meta = e.metaKey || e.ctrlKey;
            const key = e.key.toLowerCase();
            if (meta && key === "c") {
                const { selectedNodes, selectedEdges } = getSelectedGraph();
                if (!selectedNodes.length) return;
                clipboardRef.current = {
                    nodes: selectedNodes,
                    edges: selectedEdges,
                };
                // prevent default OS copy of DOM selection
                e.preventDefault();
            } else if (meta && key === "v") {
                if (clipboardRef.current) {
                    const { nodes: cn, edges: ce } = clipboardRef.current;
                    duplicateGraph(cn, ce, true);
                    e.preventDefault();
                }
            } else if (meta && key === "d") {
                duplicateSelection(false);
                e.preventDefault();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [duplicateSelection, getSelectedGraph, duplicateGraph]);

    // Web MIDI integration extracted to custom hook
    useMidiAccess(nodesRef, setNodes, sendMIDI);
    return (
        <div className="h-screen w-screen relative bg-gray-900 overflow-hidden">
            {/* Startup overlay to initialize audio context */}
            {!audioInitialized && (
                <div className="absolute inset-0 z-[60] flex items-center justify-center bg-gray-900/70 backdrop-blur-xl">
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-xl max-w-sm w-[90%] text-center">
                        <h2 className="title-font text-lg text-white mb-2">
                            Initialize Audio
                        </h2>
                        <p className="text-sm text-gray-300 mb-4">
                            Click to start the audio engine (required by browser
                            autoplay policies).
                        </p>
                        <button
                            onClick={() => {
                                void initializeAudio();
                            }}
                            className="px-4 py-2 rounded-lg font-medium bg-purple-600 hover:bg-purple-700 text-white w-full shadow"
                        >
                            Start Audio
                        </button>
                    </div>
                </div>
            )}
            <div className="absolute inset-0">
                <ConnectedParamsProvider edges={edges}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        edgeTypes={edgeTypes}
                        defaultEdgeOptions={{ type: 'gradient' }}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onConnectStart={handleConnectStart}
                        onConnectEnd={handleConnectEnd}
                        connectionLineStyle={
                            connectingColor
                                ? { stroke: connectingColor, strokeWidth: 2 }
                                : { stroke: "#555", strokeWidth: 2 }
                        }
                        nodeTypes={nodeTypes}
                        minZoom={0.03}
                        maxZoom={3}
                        className="react-flow-dark h-full w-full"
                        isValidConnection={isValidConnection}
                        onInit={(instance) => {
                            rfInstanceRef.current = instance;
                        }}
                        proOptions={{
                            hideAttribution: true
                        }}
                    >
                        <MiniMap
                            className="react-flow-minimap-dark !top-auto !right-auto bg-gray-800/80 backdrop-blur-md rounded-xl border border-gray-700/80 shadow"
                            style={{ width: 288, height: 146 }}
                            nodeBorderRadius={5}
                            pannable
                            zoomable
                            offsetScale={0}
                        />
                        <Background
                            variant={BackgroundVariant.Dots}
                            gap={12}
                            size={1}
                            className="bg-gray-900"
                        />
                    </ReactFlow>
                </ConnectedParamsProvider>
            </div>
            <div className="absolute top-16 left-4 bottom-44 z-50 w-72 flex flex-col pointer-events-auto gap-4">
                <SaveLoadPanel
                    onSave={handleSaveClick}
                    onLoadObject={handleLoadFromObject}
                    onLoadDefault={handleLoadDefault}
                />
                <div className="bg-gray-800/80 backdrop-blur-md rounded-xl p-3 shadow border border-gray-700/80 flex-1 overflow-y-auto">
                    <NodeLibrary onAddNode={onAddNode} />
                </div>
            </div>
            {/* Bottom-center Transport Pill */}
            <TransportPill audioManager={audioManager} />
        </div>
    );
}
