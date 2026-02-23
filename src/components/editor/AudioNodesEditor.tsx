"use client";

import React, { useCallback } from "react";
import ReactFlow, {
    MiniMap,
    Background,
    BackgroundVariant,
    ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";

import NodeLibrary from "@/components/editor/NodeLibrary";
import OscillatorNode from "@/components/nodes/OscillatorNode";
import ReverbNode from "@/components/nodes/ReverbNode";
import SpeakerNode from "@/components/nodes/SpeakerNode";
import SequencerNode from "@/components/nodes/SequencerNode";
import ArpeggiatorNode from "@/components/nodes/ArpeggiatorNode";
import SynthesizerNode from "@/components/nodes/SynthesizerNode";
import MidiInputNode from "@/components/nodes/MidiInputNode";
import SaveLoadPanel from "@/components/editor/SaveLoadPanel";
import SidebarHeaderInfo from "@/components/editor/SidebarHeaderInfo";
import { useAudioEngine } from "@/hooks/audio/useAudioEngine";
import { useProjectPersistence } from "@/hooks/state/useProjectPersistence";
import { useGraph } from "@/hooks/editor/useGraph";
import { useMidiAccess } from "@/hooks/hardware/useMidiAccess";
import { useNodeSync } from "@/hooks/editor/useNodeSync";
import { useNodeActions } from "@/hooks/editor/useNodeActions";
import { useEditorKeyboard } from "@/hooks/editor/useEditorKeyboard";
import MidiTransposeNode from "@/components/nodes/MidiTransposeNode";
import GradientEdge from "@/components/editor/GradientEdge";
import { getNodeMeta } from "@core-audio/client/nodeRegistry";
import type { OnConnectStartParams } from "reactflow";
import ValueBoolNode from "@/components/nodes/ValueBoolNode";
import CameraHandsNode from "@/components/nodes/CameraHandsNode";
import ValueNumberNode from "@/components/nodes/ValueNumberNode";
import ValueTextNode from "@/components/nodes/ValueTextNode";
import ValueSelectNode from "@/components/nodes/ValueSelectNode";
import TransportPill from "@/components/shared/TransportPill";
import LFONode from "@/components/nodes/LFONode";
import ValueCompareNode from "@/components/nodes/ValueCompareNode";
import ValueLogicNode from "@/components/nodes/ValueLogicNode";
import ValueAddNode from "@/components/nodes/ValueAddNode";
import ValueSubtractNode from "@/components/nodes/ValueSubtractNode";
import ValueMultiplyNode from "@/components/nodes/ValueMultiplyNode";
import ValueDivideNode from "@/components/nodes/ValueDivideNode";
import ValueConditionNode from "@/components/nodes/ValueConditionNode";
import { ConnectedParamsProvider } from "@/components/editor/ConnectedParamsContext";
import { AudioManagerProvider } from "@core-audio/client/AudioManagerContext";

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
    "camera-hands": CameraHandsNode,
    "logic-compare": ValueCompareNode,
    "logic-gate": ValueLogicNode,
    "logic-add": ValueAddNode,
    "logic-subtract": ValueSubtractNode,
    "logic-multiply": ValueMultiplyNode,
    "logic-divide": ValueDivideNode,
    "logic-condition": ValueConditionNode,
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
    const { audioManager, audioInitialized, initializeAudio, sendMIDI } = useAudioEngine();

    // Bridge: forward sequencerStep events from audioManager → window (SequencerNode listens)
    React.useEffect(() => {
        const off = audioManager.onSequencerStep((nodeId: string, stepIndex: number) => {
            try { window.dispatchEvent(new CustomEvent("audioNodesSequencerStep", { detail: { nodeId, stepIndex } })); } catch { }
        });
        return () => { try { off(); } catch { } };
    }, [audioManager]);

    const rfInstanceRef = React.useRef<ReactFlowInstance | null>(null);
    const [connectingColor, setConnectingColor] = React.useState<string | null>(null);

    const handleConnectStart = useCallback(
        (_: unknown, params: OnConnectStartParams) => {
            const nid = params?.nodeId;
            if (!nid) { setConnectingColor(null); return; }
            const node = nodes.find(n => n.id === nid);
            setConnectingColor(node ? getNodeMeta(node.type).accentColor : null);
        },
        [nodes],
    );
    const handleConnectEnd = useCallback(() => setConnectingColor(null), []);

    // Parameter change — syncs to graph state and worklet
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

    // MIDI emit
    const handleEmitMidi = useCallback(
        (sourceId: string, events: Array<{ data: [number, number, number]; atFrame?: number; atTimeMs?: number }>) => sendMIDI(sourceId, events),
        [sendMIDI],
    );

    // Worklet sync (node updates, connection updates, handler reattachment)
    const { reattachHandlers, attachHandlers } = useNodeSync({ nodes, edges, setNodes, audioManager });

    // Sync handler callbacks whenever they change
    React.useEffect(() => {
        attachHandlers(handleParameterChange as (...args: unknown[]) => void, handleEmitMidi as (...args: unknown[]) => void);
    }, [handleParameterChange, handleEmitMidi, attachHandlers]);

    // Node actions: add, copy/paste/duplicate
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
        handleParameterChange: handleParameterChange as (...args: unknown[]) => void,
        handleEmitMidi: handleEmitMidi as (...args: unknown[]) => void,
    });

    // Keep stable refs in sync
    React.useEffect(() => { syncRefs(nodes, edges); }, [nodes, edges, syncRefs]);

    // Keyboard shortcuts
    useEditorKeyboard({ getSelectedGraph, duplicateGraph, duplicateSelection, clipboardRef });

    // Reattach handler helper for persistence hook
    const reattachHandlersCb = useCallback(
        (data: Record<string, unknown> | undefined) =>
            reattachHandlers(
                data,
                handleParameterChange as (...args: unknown[]) => void,
                handleEmitMidi as (...args: unknown[]) => void,
            ),
        [reattachHandlers, handleParameterChange, handleEmitMidi],
    );

    const {
        handleSaveClick,
        handleLoadFromObject,
        loadFromLocalStorage,
        handleLoadDefault,
    } = useProjectPersistence(nodes, edges, setNodes, setEdges, rfInstanceRef, reattachHandlersCb);

    // Autoload project on mount
    const didBootRef = React.useRef(false);
    React.useEffect(() => {
        if (didBootRef.current) return;
        didBootRef.current = true;
        const boot = async () => {
            const ok = loadFromLocalStorage();
            if (ok) return;
            for (const url of ["/projects/default-project.json", "/default-project.json"]) {
                try {
                    const res = await fetch(`${url}?v=${Date.now()}`);
                    if (!res.ok) continue;
                    handleLoadFromObject(await res.json() as unknown);
                    break;
                } catch { }
            }
        };
        void boot();
    }, [handleLoadFromObject, loadFromLocalStorage]);

    // Web MIDI integration
    useMidiAccess(nodesRef, setNodes, sendMIDI);
    return (
        <AudioManagerProvider manager={audioManager}>
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
                                style={{ width: 288, height: 146, strokeLinejoin: "round" }}
                                nodeBorderRadius={24}
                                nodeColor={(node) => {
                                    return getNodeMeta(node.type).accentColor;
                                }}
                                maskColor="rgba(17, 24, 39, 0.6)"
                                maskStrokeColor="rgba(17, 24, 39, 0.6)"
                                maskStrokeWidth={20}
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
                {/* Bottom-center Transport Pill */}
                <TransportPill audioManager={audioManager} />

                <div className="absolute top-4 left-4 bottom-44 z-50 w-72 flex flex-col pointer-events-auto gap-4">
                    <SidebarHeaderInfo />
                    <SaveLoadPanel
                        onSave={handleSaveClick}
                        onLoadObject={handleLoadFromObject}
                        onLoadDefault={handleLoadDefault}
                    />
                    <div className="bg-gray-800/80 backdrop-blur-md rounded-xl p-3 shadow border border-gray-700/80 flex-1 overflow-y-auto">
                        <NodeLibrary onAddNode={onAddNode} />
                    </div>
                </div>
            </div>
        </AudioManagerProvider>
    );
}
