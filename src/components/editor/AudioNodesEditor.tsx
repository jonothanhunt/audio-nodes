"use client";
/**
 * Main node-based audio editor entry point.
 * Orchestrates React Flow, the AudioEngine, MIDI integration, and project persistence.
 */

import React, { useCallback } from "react";
import ReactFlow, {
    MiniMap,
    Background,
    BackgroundVariant,
    ReactFlowInstance,
    useNodesInitialized,
    useReactFlow,
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
import { useProjectPersistence } from "@/hooks/state/useProjectPersistence";
import { useMidiAccess } from "@/hooks/hardware/useMidiAccess";
import { useEditorKeyboard } from "@/hooks/editor/useEditorKeyboard";
import MidiTransposeNode from "@/components/nodes/MidiTransposeNode";
import GradientEdge from "@/components/editor/GradientEdge";
import { getNodeMeta } from "@core-audio/client/nodeRegistry";
import type { OnConnectStartParams, Node, Edge, OnNodesChange, OnEdgesChange, OnConnect, Connection } from "reactflow";
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
import ToRangeNode from "@/components/nodes/ToRangeNode";
import FromRangeNode from "@/components/nodes/FromRangeNode";
import NotesNode from "@/components/nodes/NotesNode";
import { ConnectedParamsProvider } from "@/components/editor/ConnectedParamsContext";
import { AudioManagerProvider } from "@core-audio/client/AudioManagerContext";
import { AudioManager } from "@core-audio/client/audioManager";

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
    "logic-to-range": ToRangeNode,
    "logic-from-range": FromRangeNode,
    notes: NotesNode,
};

const edgeTypes = { gradient: GradientEdge };

interface AudioNodesEditorProps {
    nodes: Node[];
    edges: Edge[];
    audioInitialized: boolean;
    audioManager: AudioManager;
    onNodesChange: OnNodesChange;
    onEdgesChange: OnEdgesChange;
    onConnect: OnConnect;
    isValidConnection: (connection: Connection) => boolean;
    onAddNode: (type: string) => void;
    initializeAudio: () => Promise<boolean>;
    persistence: ReturnType<typeof useProjectPersistence>;
    rfInstanceRef: React.MutableRefObject<ReactFlowInstance | null>;
    nodeActions: {
        getSelectedGraph: () => { selectedNodes: Node[]; selectedEdges: Edge[] };
        duplicateGraph: (nodes: Node[], edges: Edge[], center: boolean) => void;
        duplicateSelection: (center: boolean) => void;
        clipboardRef: React.MutableRefObject<{ nodes: Node[]; edges: Edge[] } | null>;
        nodesRef: React.MutableRefObject<Node[]>;
    };
}

export default function AudioNodesEditor({
    nodes,
    edges,
    audioInitialized,
    audioManager,
    onNodesChange,
    onEdgesChange,
    onConnect,
    isValidConnection,
    onAddNode,
    initializeAudio,
    persistence,
    rfInstanceRef,
    nodeActions,
}: AudioNodesEditorProps) {
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

    // Keyboard shortcuts
    useEditorKeyboard({
        getSelectedGraph: nodeActions.getSelectedGraph,
        duplicateGraph: nodeActions.duplicateGraph,
        duplicateSelection: nodeActions.duplicateSelection,
        clipboardRef: nodeActions.clipboardRef,
    });

    // Fit view once on load
    const { fitView } = useReactFlow();
    const nodesInitialized = useNodesInitialized();
    const hasFitViewRef = React.useRef(false);

    React.useEffect(() => {
        // left: 380px clears the 288px sidebar + margins/padding. We use a number here
        // since older reactflow versions only support number for padding. The offset
        // is handled by the container padding or CSS instead of fitView
        fitView({
            padding: 0.2,
            duration: 0,
            maxZoom: 1,
        });
    }, [nodesInitialized, nodes.length, fitView]);

    // Web MIDI integration
    useMidiAccess(nodeActions.nodesRef, () => { /* this usually setNodes, but useMidiAccess needs refactor or skip */ }, (s, e) => audioManager.sendMIDI(s, e));

    return (
        <AudioManagerProvider manager={audioManager}>
            <div className="h-screen w-screen relative bg-gray-900 overflow-hidden">
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
                                className="react-flow-minimap-dark !top-auto !right-auto bg-gray-800/80 backdrop-blur-md rounded-xl border border-gray-700/80"
                                style={{ width: 288, height: 146, strokeLinejoin: "round" }}
                                nodeBorderRadius={24}
                                nodeStrokeWidth={0}
                                nodeStrokeColor="transparent"
                                nodeColor={(node) => {
                                    return getNodeMeta(node.type).accentColor;
                                }}
                                maskColor="rgba(17, 24, 39, 0.6)"
                                maskStrokeColor="transparent"
                                maskStrokeWidth={0}
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
                <TransportPill audioManager={audioManager} />

                <div className="absolute top-4 left-4 bottom-44 z-50 w-72 flex flex-col pointer-events-auto gap-4">
                    <SidebarHeaderInfo />
                    <SaveLoadPanel
                        onSave={persistence.handleSaveClick}
                        onLoadObject={persistence.handleLoadFromObject}
                        onLoadDefault={persistence.handleLoadDefault}
                    />
                    <div className="bg-gray-800/80 backdrop-blur-md rounded-xl p-3 shadow border border-gray-700/80 flex-1 overflow-y-auto">
                        <NodeLibrary onAddNode={onAddNode} />
                    </div>
                </div>
            </div>
        </AudioManagerProvider>
    );
}
