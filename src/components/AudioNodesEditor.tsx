"use client";

import React, { useCallback } from "react";
import ReactFlow, {
  MiniMap,
  Background,
  BackgroundVariant,
  Node,
  ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";

import NodeLibrary from "@/components/NodeLibrary";
import OscillatorNode from "@/components/nodes/OscillatorNode";
import ReverbNode from "@/components/nodes/ReverbNode";
import SpeakerNode from "@/components/nodes/SpeakerNode";
import SequencerNode from "@/components/nodes/SequencerNode";
import SynthesizerNode from "./nodes/SynthesizerNode";
import TitleBarCreds from "@/components/TitleBarCreds";
import SaveLoadPanel from "@/components/SaveLoadPanel";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { getDefaultNodeData } from "@/lib/nodes";
import { useProjectPersistence } from "@/hooks/useProjectPersistence";
import { useGraph } from "@/hooks/useGraph";

// Define custom node types outside component to avoid React Flow warning
const nodeTypes = {
  oscillator: OscillatorNode,
  reverb: ReverbNode,
  speaker: SpeakerNode,
  sequencer: SequencerNode,
  synth: SynthesizerNode,
};

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
  const {
    audioManager,
    audioInitialized,
    initializeAudio,
    wasmReady,
    sendMIDI,
  } = useAudioEngine();
  const rfInstanceRef = React.useRef<ReactFlowInstance | null>(null);

  // Expose a MIDI emit function to nodes (e.g., Sequencer)
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

  // Handle parameter changes for nodes
  const handleParameterChange = useCallback(
    (nodeId: string, parameter: string, value: string | number | boolean) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            const updatedNode = {
              ...node,
              data: {
                ...node.data,
                [parameter]: value,
              },
            };

            // Update the audio manager with the new node data
            audioManager.updateNode(nodeId, {
              type: node.type || "unknown",
              ...updatedNode.data,
            });

            return updatedNode;
          }
          return node;
        })
      );
    },
    [setNodes, audioManager]
  );

  // Sync audio nodes on change
  React.useEffect(() => {
    nodes.forEach((node) => {
      if (node.data && node.type) {
        audioManager.updateNode(node.id, {
          type: node.type,
          ...node.data,
        });
      }
    });
  }, [nodes, audioManager]);

  // Sync audio connections on change
  React.useEffect(() => {
    const connections = edges.map((edge) => ({
      from: edge.source,
      to: edge.target,
      fromOutput: edge.sourceHandle || "output",
      toInput: edge.targetHandle || "input",
    }));
    audioManager.updateConnections(connections);
  }, [edges, audioManager]);

  // Attach handlers into node data
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

  // Reattach helpers for persistence
  const reattachHandlers = useCallback(
    (data: Record<string, unknown> | undefined): Record<string, unknown> => ({
      ...(data || {}),
      onParameterChange: handleParameterChange,
      onEmitMidi: handleEmitMidi,
    }),
    [handleParameterChange, handleEmitMidi]
  );

  const {
    handleSaveClick,
    handleLoadFromObject,
    onDropProjectFile,
    onDragOverProjectFile,
    // new
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

  // Drag overlay state
  const [isDragActive, setIsDragActive] = React.useState(false);
  const dragCounterRef = React.useRef(0);

  const handleDragEnter: React.DragEventHandler<HTMLDivElement> = React.useCallback(
    (e) => {
      e.preventDefault();
      dragCounterRef.current += 1;
      setIsDragActive(true);
    },
    []
  );

  const handleDragLeave: React.DragEventHandler<HTMLDivElement> = React.useCallback(
    (e) => {
      e.preventDefault();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragActive(false);
      }
    },
    []
  );

  const handleDragOver: React.DragEventHandler<HTMLDivElement> = React.useCallback(
    (e) => {
      onDragOverProjectFile(e);
      try {
        if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) {
          e.dataTransfer.dropEffect = "copy";
        }
      } catch {}
      setIsDragActive(true);
    },
    [onDragOverProjectFile]
  );

  const handleDrop: React.DragEventHandler<HTMLDivElement> = React.useCallback(
    (e) => {
      setIsDragActive(false);
      dragCounterRef.current = 0;
      onDropProjectFile(e);
    },
    [onDropProjectFile]
  );

  // Autoload: try localStorage, then default project
  React.useEffect(() => {
    const boot = async () => {
      const ok = loadFromLocalStorage();
      if (ok) return;
      // fallback to default
      const candidates = [
        "/projects/default-project.json", // served from public/projects
        "/default-project.json",
      ];
      for (const url of candidates) {
        try {
          const res = await fetch(`${url}?v=${Date.now()}`);
          if (!res.ok) continue;
          const json = await res.json();
          handleLoadFromObject(json as unknown);
          break;
        } catch {
          // ignore and try next
        }
      }
    };
    boot();
  }, [handleLoadFromObject, loadFromLocalStorage]);

  const onAddNode = useCallback(
    (type: string) => {
      const newNode: Node = {
        id: generateNodeId(),
        type,
        position: { x: Math.random() * 400, y: Math.random() * 400 },
        data: getDefaultNodeData(type, handleParameterChange, handleEmitMidi),
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [generateNodeId, setNodes, handleParameterChange, handleEmitMidi]
  );

  const handleInitializeAudio = useCallback(async () => {
    await initializeAudio();
  }, [initializeAudio]);

  return (
    <div
      className="h-screen relative bg-gray-900"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      {/* Fixed Title/Creds always on top */}
      <div className="fixed top-4 left-4 z-[60] w-72 pointer-events-auto">
        <TitleBarCreds />
      </div>

      {/* Drag overlay */}
      {isDragActive && (
        <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center">
          <div className="pointer-events-none mx-4 w-full max-w-lg">
            <div className="rounded-2xl border-2 border-dashed border-purple-500/70 bg-gray-900/60 backdrop-blur-md shadow-2xl p-8 text-center">
              <div className="text-sm text-gray-300">Drop project file to open</div>
            </div>
          </div>
        </div>
      )}

      {/* Overlay start screen */}
      {!audioInitialized && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-xl">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-xl max-w-sm w-[90%] text-center">
            <h2 className="title-font font-w-70 text-lg text-white mb-2">
              Hey, welcome to Audio Nodes!
            </h2>
            <p className="text-sm text-gray-300 mb-4">
              Let&apos;s get the audio engine started...
            </p>
            <button
              onClick={handleInitializeAudio}
              className="px-4 py-2 rounded-lg font-medium bg-purple-600 hover:bg-purple-700 text-white w-full shadow"
            >
              Initialize Audio
            </button>
            {/* <div className="mt-3 text-xs text-gray-400">
              Sample Rate: auto • Engine: {wasmReady ? "Ready" : "Loading..."}
            </div> */}
          </div>
        </div>
      )}

      {/* Fullscreen canvas and overlayed left panels */}
      <div className={`absolute inset-0`}>
        {/* React Flow full-screen surface */}
        <div className="absolute inset-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            proOptions={{ hideAttribution: true }}
            // fitView
            minZoom={0.03}
            maxZoom={3}
            className="react-flow-dark h-full w-full"
            isValidConnection={isValidConnection}
            onInit={(instance) => {
              rfInstanceRef.current = instance;
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
        </div>

        {/* Left overlay column: Save/Load, Library panel */}
        <div className="absolute top-4 left-4 bottom-44 z-30 w-72 flex flex-col pointer-events-auto gap-4">
          {/* Spacer to account for fixed title height */}
          <div className="h-10" />

          {/* Save/Load panel */}
          <SaveLoadPanel
            onSave={handleSaveClick}
            onLoadObject={handleLoadFromObject}
            onLoadDefault={handleLoadDefault}
          />

          {/* Library panel */}
          <div className="bg-gray-800/80 backdrop-blur-md rounded-xl p-3 shadow border border-gray-700/80 flex-1 overflow-y-auto">
            <NodeLibrary onAddNode={onAddNode} />
          </div>

          {/* space reserved below by bottom-40 to align with MiniMap overlay */}
        </div>
      </div>
    </div>
  );
}
