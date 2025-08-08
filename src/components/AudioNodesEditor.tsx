"use client";

import React, { useCallback, useState } from "react";
import ReactFlow, {
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  ReactFlowInstance,
  Viewport,
} from "reactflow";
import "reactflow/dist/style.css";

import NodeLibrary from "@/components/NodeLibrary";
import OscillatorNode from "@/components/nodes/OscillatorNode";
import ReverbNode from "@/components/nodes/ReverbNode";
import SpeakerNode from "@/components/nodes/SpeakerNode";
import SequencerNode from "@/components/nodes/SequencerNode";
import { AudioManager } from "@/lib/audioManager";
import SynthesizerNode from "./nodes/SynthesizerNode";
import Link from "next/link";

// Save file schema
interface SavedNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data?: Record<string, unknown>;
}
interface SavedEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}
interface ProjectSaveFile {
  version: number;
  createdAt?: string;
  nodes: SavedNode[];
  edges: SavedEdge[];
  viewport?: Viewport;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// Map handle ids to semantic roles so we can validate connections
function getHandleRole(
  nodeType: string | undefined,
  handleId: string | undefined
): "audio-in" | "audio-out" | "param-in" | "midi-out" | "midi-in" | "unknown" {
  switch (nodeType) {
    case "oscillator":
      if (handleId === "output") return "audio-out";
      if (handleId === "frequency" || handleId === "amplitude")
        return "param-in";
      return "unknown";
    case "reverb":
      if (handleId === "input") return "audio-in";
      if (handleId === "output") return "audio-out";
      if (handleId === "feedback" || handleId === "wetMix") return "param-in";
      return "unknown";
    case "speaker":
      if (handleId === "input") return "audio-in";
      if (handleId === "volume") return "param-in";
      return "unknown";
    case "sequencer":
      if (handleId === "midi") return "midi-out";
      if (handleId === "play" || handleId === "bpm") return "param-in";
      return "unknown";
    case "synth":
      if (handleId === "midi") return "midi-in";
      if (handleId === "output") return "audio-out";
      if (
        [
          "preset",
          "waveform",
          "attack",
          "decay",
          "sustain",
          "release",
          "cutoff",
          "resonance",
          "glide",
          "gain",
          "maxVoices",
        ].includes(handleId || "")
      )
        return "param-in";
      return "unknown";
    default:
      return "unknown";
  }
}

// Define custom node types outside component to avoid React Flow warning
const nodeTypes = {
  oscillator: OscillatorNode,
  reverb: ReverbNode,
  speaker: SpeakerNode,
  sequencer: SequencerNode,
  synth: SynthesizerNode,
};

// Initial node configurations
const initialNodes: Node[] = [];

const initialEdges: Edge[] = [];

export default function AudioNodesEditor() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [wasmReady, setWasmReady] = useState(false);
  const [audioManager] = useState(() => new AudioManager());
  const rfInstanceRef = React.useRef<ReactFlowInstance | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Generate a unique node id to avoid collisions replacing existing nodes
  const generateNodeId = React.useCallback(() => {
    const existing = new Set(nodes.map((n) => n.id));
    let id = "";
    // Prefer crypto.randomUUID when available
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      do {
        id = `n-${(crypto as Crypto).randomUUID()}`;
      } while (existing.has(id));
      return id;
    }
    // Fallback: random string
    do {
      id = `n-${Math.random().toString(36).slice(2, 10)}`;
    } while (existing.has(id));
    return id;
  }, [nodes]);

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
      audioManager.sendMIDI(sourceId, events);
    },
    [audioManager]
  );

  // Poll for WASM readiness
  React.useEffect(() => {
    const checkWasmReady = () => {
      const ready = audioManager.isReady();
      if (ready !== wasmReady) {
        setWasmReady(ready);
      }
    };

    // Check immediately and then poll every 100ms until ready
    checkWasmReady();
    if (!wasmReady) {
      const interval = setInterval(checkWasmReady, 100);
      return () => clearInterval(interval);
    }
  }, [audioManager, wasmReady]);

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

  // Update audio nodes when nodes change
  React.useEffect(() => {
    // Initialize all nodes in the audio manager
    nodes.forEach((node) => {
      if (node.data && node.type) {
        audioManager.updateNode(node.id, {
          type: node.type,
          ...node.data,
        });
      }
    });
  }, [nodes, audioManager]);

  // Update audio connections when edges change
  React.useEffect(() => {
    const connections = edges.map((edge) => ({
      from: edge.source,
      to: edge.target,
      fromOutput: edge.sourceHandle || "output",
      toInput: edge.targetHandle || "input",
    }));
    audioManager.updateConnections(connections);
    console.log("Updated audio connections:", connections);
  }, [edges, audioManager]);

  // Update initial nodes with the parameter change handler and register them with audio manager
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

    // removed initial registration into audio manager; nodes effect below handles syncing
  }, [handleParameterChange, handleEmitMidi, setNodes]);

  // Validate connections: allow audio-out -> audio-in and midi-out -> midi-in
  const isValidConnection = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return false;

      const fromRole = getHandleRole(
        sourceNode.type,
        connection.sourceHandle || undefined
      );
      const toRole = getHandleRole(
        targetNode.type,
        connection.targetHandle || undefined
      );

      const audioOk = fromRole === "audio-out" && toRole === "audio-in";
      const midiOk = fromRole === "midi-out" && toRole === "midi-in";
      return audioOk || midiOk;
    },
    [nodes]
  );

  // -------- Save/Load Helpers --------
  const stripNodeData = React.useCallback(
    (data: Record<string, unknown> | undefined): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data || {})) {
        if (typeof v === "function") continue;
        if (k.startsWith("on")) continue;
        out[k] = v as unknown;
      }
      return out;
    },
    []
  );

  const makeSaveObject = React.useCallback((): ProjectSaveFile => {
    const viewport = rfInstanceRef.current?.getViewport();
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: stripNodeData(n.data as Record<string, unknown>),
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || undefined,
        targetHandle: e.targetHandle || undefined,
      })),
      viewport,
    };
  }, [nodes, edges, stripNodeData]);

  const downloadJSON = React.useCallback((obj: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  const handleSaveClick = React.useCallback(() => {
    const save = makeSaveObject();
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    downloadJSON(save, `audionodes-${ts}.json`);
  }, [makeSaveObject, downloadJSON]);

  const reattachHandlers = React.useCallback(
    (data: Record<string, unknown> | undefined): Record<string, unknown> => ({
      ...(data || {}),
      onParameterChange: handleParameterChange,
      onEmitMidi: handleEmitMidi,
    }),
    [handleParameterChange, handleEmitMidi]
  );

  const handleLoadFromObject = React.useCallback(
    (obj: unknown) => {
      if (!isRecord(obj)) return;
      const maybe = obj as Partial<ProjectSaveFile>;
      const rawNodes = Array.isArray(maybe.nodes) ? maybe.nodes : [];
      const rawEdges = Array.isArray(maybe.edges) ? maybe.edges : [];

      const loadedNodes: Node[] = rawNodes.map((n) => ({
        id: String(n.id),
        type: n.type,
        position: n.position || { x: 0, y: 0 },
        data: reattachHandlers(n.data as Record<string, unknown> | undefined),
      }));

      const loadedEdges: Edge[] = rawEdges.map((e) => ({
        id:
          e.id ||
          `${e.source}-${e.sourceHandle || "out"}->${e.target}-${
            e.targetHandle || "in"
          }`,
        source: String(e.source),
        target: String(e.target),
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      }));

      setNodes(loadedNodes);
      setEdges(loadedEdges);

      // Restore viewport if present
      if (maybe.viewport && rfInstanceRef.current) {
        const v = maybe.viewport as Viewport;
        rfInstanceRef.current.setViewport(
          { x: v.x || 0, y: v.y || 0, zoom: v.zoom || 1 },
          { duration: 0 }
        );
      }
    },
    [setNodes, setEdges, reattachHandlers]
  );

  const handleLoadFile = React.useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const obj = JSON.parse(String(reader.result || "{}")) as unknown;
          handleLoadFromObject(obj);
        } catch (err) {
          console.error("Failed to parse project file:", err);
        }
      };
      reader.readAsText(file);
    },
    [handleLoadFromObject]
  );

  const onPickLoadFile = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onDropProjectFile: React.DragEventHandler<HTMLDivElement> =
    React.useCallback(
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer?.files?.[0];
        if (
          file &&
          (file.type === "application/json" || file.name.endsWith(".json"))
        ) {
          handleLoadFile(file);
        }
      },
      [handleLoadFile]
    );

  const onDragOverProjectFile: React.DragEventHandler<HTMLDivElement> =
    React.useCallback((e) => {
      e.preventDefault();
    }, []);

  // Attempt to load a default project on startup from /default-project.json or /projects/default-project.json
  // moved below handleLoadFromObject to avoid use-before-declare
  React.useEffect(() => {
    const loadDefault = async () => {
      const candidates = [
        "/default-project.json",
        "/projects/default-project.json",
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
    loadDefault();
  }, [handleLoadFromObject]);

  // -------- End Save/Load Helpers --------

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        isValidConnection(params) ? addEdge(params, eds) : eds
      ),
    [setEdges, isValidConnection]
  );

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
    try {
      const success = await audioManager.initializeAudio();
      if (success) {
        setAudioInitialized(true);
        console.log("Audio system initialized and ready");
      } else {
        console.error("Failed to initialize audio system");
      }
    } catch (error) {
      console.error("Error initializing audio:", error);
    }
  }, [audioManager]);

  return (
    <div
      className="h-screen relative bg-gray-900"
      onDrop={onDropProjectFile}
      onDragOver={onDragOverProjectFile}
    >
      {/* Overlay start screen */}
      {!audioInitialized && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-xl max-w-sm w-[90%] text-center">
            <h2 className="text-lg font-semibold text-white mb-2">
              Enable Audio
            </h2>
            <p className="text-sm text-gray-300 mb-4">
              Click to initialize the audio engine. You can still load/save
              projects from the menu.
            </p>
            <button
              onClick={handleInitializeAudio}
              className="px-4 py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white w-full"
            >
              Initialize Audio
            </button>
            <div className="mt-3 text-xs text-gray-400">
              Sample Rate: auto • Engine: {wasmReady ? "Ready" : "Loading..."}
            </div>
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

        {/* Custom Controls Panel (optional) */}
        {/* <div className="absolute bottom-4 left-[19rem] z-30 bg-gray-800/80 backdrop-blur-md rounded-xl p-1.5 border border-gray-700/80 shadow flex flex-col overflow-hidden">
          <button
            className="px-3 py-2 text-white hover:bg-gray-700/80"
            onClick={() => {
              const inst = rfInstanceRef.current;
              if (!inst) return;
              const vp = inst.getViewport();
              const nz = Math.min(3, Math.max(0.03, vp.zoom * 1.2));
              inst.setViewport({ x: vp.x, y: vp.y, zoom: nz });
            }}
            title="Zoom In"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            className="px-3 py-2 text-white hover:bg-gray-700/80 border-t border-gray-700/60"
            onClick={() => {
              const inst = rfInstanceRef.current;
              if (!inst) return;
              const vp = inst.getViewport();
              const nz = Math.min(3, Math.max(0.03, vp.zoom / 1.2));
              inst.setViewport({ x: vp.x, y: vp.y, zoom: nz });
            }}
            title="Zoom Out"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            className="px-3 py-2 text-white hover:bg-gray-700/80 border-t border-gray-700/60"
            onClick={() => rfInstanceRef.current?.fitView?.()}
            title="Fit View"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div> */}

        {/* Left overlay column: Title, Save/Load, Library panel */}
        <div className="absolute top-4 left-4 bottom-44 z-30 w-72 flex flex-col pointer-events-auto gap-4">
          {/* App Title */}
          <div className="w-full">
            <div className="w-full text-sm text-purple-950 dark:text-gray-400">
              <div className="flex w-full">
                <Link
                  className="flex-1 px-3 py-2 bg-gray-800/80 backdrop-blur-md border border-gray-700/80 border-r-0 shadow rounded-l-xl text-white transition-all duration-300 ease-in-out hover:bg-pink-200 hover:text-purple-950 hover:rounded-l-2xl hover:shadow-lg hover:shadow-pink-900/10 hover:-translate-y-1 inline-flex items-center justify-center peer"
                  href="https://think.jonothan.dev"
                >
                  audio-nodes
                </Link>
                <Link
                  className="flex-1 px-3 py-2 bg-gray-800/80 backdrop-blur-md border border-gray-700/80 shadow rounded-r-xl text-white transition-all duration-300 ease-in-out hover:bg-pink-200 peer-hover:bg-pink-200 peer-hover:text-purple-950 hover:text-purple-950 hover:rounded-r-2xl hover:shadow-lg hover:shadow-pink-900/10 peer-hover:-translate-y-1 hover:-translate-y-1 inline-flex items-center justify-center"
                  href="https://jonothan.dev"
                >
                  jonothan.dev
                </Link>
              </div>
            </div>
          </div>

          {/* Save/Load panel */}
          <div className="bg-gray-800/80 backdrop-blur-md rounded-xl p-3 shadow border border-gray-700/80">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleLoadFile(f);
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={handleSaveClick}
                className="px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-white text-sm w-full"
                title="Download project (.json)"
              >
                Save
              </button>
              <button
                onClick={onPickLoadFile}
                className="px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-white text-sm w-full"
                title="Load project from file"
              >
                Load
              </button>
            </div>
          </div>

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

// Helper function to get default data for new nodes
function getDefaultNodeData(
  type: string,
  onParameterChange: (
    nodeId: string,
    parameter: string,
    value: string | number | boolean
  ) => void,
  onEmitMidi?: (
    sourceId: string,
    events: Array<{
      data: [number, number, number];
      atFrame?: number;
      atTimeMs?: number;
    }>
  ) => void
) {
  switch (type) {
    case "oscillator":
      return {
        frequency: 440,
        amplitude: 0.5,
        waveform: "sine",
        onParameterChange,
      };
    case "reverb":
      return { feedback: 0.3, wetMix: 0.3, onParameterChange };
    case "speaker":
      return { volume: 0.8, muted: false, onParameterChange };
    case "sequencer":
      return {
        length: 16,
        fromNote: "C4",
        toNote: "C5",
        bpm: 120,
        playing: false,
        onParameterChange,
        onEmitMidi,
      };
    case "synth":
      return {
        preset: "Init",
        waveform: "sawtooth",
        attack: 0.005,
        decay: 0.12,
        sustain: 0.7,
        release: 0.12,
        cutoff: 10000,
        resonance: 0.2,
        glide: 0,
        gain: 0.5,
        maxVoices: 8,
        onParameterChange,
      };
    default:
      return { onParameterChange };
  }
}
