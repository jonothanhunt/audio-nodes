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
import MidiInputNode from "@/components/nodes/MidiInputNode";
import TitleBarCreds from "@/components/TitleBarCreds";
import SaveLoadPanel from "@/components/SaveLoadPanel";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { getDefaultNodeData } from "@/lib/nodes";
import { useProjectPersistence } from "@/hooks/useProjectPersistence";
import { useGraph } from "@/hooks/useGraph";
import MidiTransposeNode from "@/components/nodes/MidiTransposeNode";

// Custom node registry
const nodeTypes = {
  oscillator: OscillatorNode,
  reverb: ReverbNode,
  speaker: SpeakerNode,
  sequencer: SequencerNode,
  synth: SynthesizerNode,
  'midi-input': MidiInputNode,
  'midi-transpose': MidiTransposeNode,
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
    sendMIDI,
  } = useAudioEngine();
  const rfInstanceRef = React.useRef<ReactFlowInstance | null>(null);

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
    (nodeId: string, parameter: string, value: string | number | boolean) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            const updatedNode = {
              ...node,
              data: { ...node.data, [parameter]: value },
            };
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

  // Sync nodes to worklet
  React.useEffect(() => {
    nodes.forEach((node) => {
      if (node.data && node.type) {
        audioManager.updateNode(node.id, { type: node.type, ...node.data });
      }
    });
  }, [nodes, audioManager]);

  // Sync connections
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
  React.useEffect(() => {
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
        } catch {}
      }
    };
    boot();
  }, [handleLoadFromObject, loadFromLocalStorage]);

  // Add new node
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

  // Web MIDI integration
  const nodesRef = React.useRef(nodes);
  React.useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  React.useEffect(() => {
    let mounted = true;
    const STATUS_PREFIX = '[MIDI]';

    const activeNotesRef = new Map<string, Set<number>>(); // nodeId -> active note numbers

    const setStatusAll = (status: string) => {
      setNodes(prev => prev.map(n => n.type === 'midi-input' ? { ...n, data: { ...n.data, status } } : n));
    };
    const setErrorAll = (error: string) => {
      setNodes(prev => prev.map(n => n.type === 'midi-input' ? { ...n, data: { ...n.data, error } } : n));
    };

    if (typeof window === 'undefined') return;
    const secure = window.isSecureContext;
    console.info(STATUS_PREFIX, 'secureContext=', secure, 'protocol=', location.protocol, 'host=', location.host);
    if (!secure) {
      setStatusAll('insecure-context');
      return;
    }
    if (!('requestMIDIAccess' in navigator)) {
      setStatusAll('unsupported');
      return;
    }

    // Simplified: use built-in Web MIDI types (lib.dom) and helper functions

    const getInputs = (access: MIDIAccess): MIDIInput[] => {
      try { return Array.from(access.inputs.values()); } catch { return []; }
    };

    interface MidiNodeData { deviceId?: string; devices?: Array<{ id: string; name: string }>; status?: string; activeNotes?: number[]; channel?: number | 'all'; error?: string; [k: string]: unknown }

    const publishDevices = (access: MIDIAccess) => {
      const inputs = getInputs(access);
      const list: Array<{ id: string; name: string }> = [];
      const seen = new Set<string>();
      inputs.forEach((inp, idx) => {
        const rawId = (inp.id || '').trim();
        const rawName = (inp.name || rawId || '').trim();
        const id = rawId || rawName || `device-${idx}`;
        const name = rawName || rawId || id;
        const key = id + '::' + name;
        if (seen.has(key)) return;
        seen.add(key);
        list.push({ id, name });
      });
      list.sort((a,b)=>a.name.localeCompare(b.name));
      setNodes(prev => {
        type GenericNode = typeof prev[number];
        const updated = prev.map(n => {
          if (n.type !== 'midi-input') return n;
          const existing = n.data as unknown as MidiNodeData;
          const currentId = existing.deviceId || '';
          const nextId = currentId && list.some(d => d.id === currentId) ? currentId : '';
          const hasActive = Array.isArray(existing.activeNotes) && existing.activeNotes.length > 0;
          const newData: MidiNodeData = { ...existing, devices: list, deviceId: nextId, status: hasActive ? existing.status : 'listening' };
          return { ...n, data: newData as unknown as GenericNode['data'] };
        }) as typeof prev;
        return updated;
      });
      if (list.length === 0) setStatusAll('no-devices'); else setStatusAll('listening');
    };

    let accessRef: MIDIAccess | null = null;
    let requesting = false;

    const attachHandlers = (access: MIDIAccess) => {
      if (!mounted) return;
      // Clear previous generic errors on success
      setNodes(prev => prev.map(n => n.type === 'midi-input' ? { ...n, data: { ...n.data, error: undefined } } : n));
      publishDevices(access);
      const updateInputHandlers = () => {
        if (!mounted) return;
        publishDevices(access);
        const inputs = getInputs(access);
        if (!inputs.length) {/* no inputs */}
        for (const input of inputs) {
          input.onmidimessage = (e: MIDIMessageEvent) => {
            const bytes = e.data;
            if (!bytes || bytes.length < 1) return;
            const status = bytes[0] & 0xff;
            const typeHigh = status & 0xf0;
            const isChannelMsg = typeHigh >= 0x80 && typeHigh <= 0xe0;
            const channel = isChannelMsg ? (status & 0x0f) + 1 : null;
            let label = '';
            switch (typeHigh) {
              case 0x80: label = 'NoteOff'; break;
              case 0x90: label = (bytes[2] ?? 0) === 0 ? 'NoteOff' : 'NoteOn'; break;
              case 0xA0: label = 'PolyAT'; break;
              case 0xB0: label = 'CC'; break;
              case 0xC0: label = 'Prog'; break;
              case 0xD0: label = 'ChAT'; break;
              case 0xE0: label = 'Pitch'; break;
              default:
                if (status === 0xF8) label = 'Clock'; else if (status === 0xFA) label = 'Start'; else if (status === 0xFC) label = 'Stop'; else label = `0x${status.toString(16)}`;
            }
            const nodesSnap = nodesRef.current;
            for (const n of nodesSnap) {
              if (n.type !== 'midi-input') continue;
              const nd = (n.data as unknown as MidiNodeData) || {};
              const devFilter = (nd.deviceId || '').trim();
              const inName = (input.name || '').trim();
              if (devFilter && devFilter !== (input.id || '') && devFilter !== inName) continue;
              if (nd.channel && nd.channel !== 'all' && channel !== null && nd.channel !== channel) continue;
              const cmd = status & 0xF0;
              if (cmd === 0x90 || cmd === 0x80) {
                const note = (bytes[1] ?? 0) & 0x7F;
                const vel = (bytes[2] ?? 0) & 0x7F;
                let set = activeNotesRef.get(n.id);
                if (!set) { set = new Set(); activeNotesRef.set(n.id, set); }
                if (cmd === 0x90 && vel > 0) set.add(note); else set.delete(note);
              }
              const activeSet = activeNotesRef.get(n.id) || new Set<number>();
              const notesArr = Array.from(activeSet.values());
              setNodes(prev => {
                type GenericNode = typeof prev[number];
                const updated = prev.map(p => {
                  if (p.id !== n.id) return p;
                  const existing = p.data as unknown as MidiNodeData;
                  const statusStrBase = notesArr.length > 0 ? [...notesArr].sort((a,b)=>a-b).join(',') : label;
                  const statusStr = (notesArr.length === 0 && (label === 'NoteOff' || label === 'NoteOn')) ? 'listening' : statusStrBase;
                  const newData: MidiNodeData = { ...existing, status: statusStr, activeNotes: notesArr };
                  return { ...p, data: newData as unknown as GenericNode['data'] };
                }) as typeof prev;
                return updated;
              });
              sendMIDI(n.id, [{ data: [status, bytes[1] ?? 0, bytes[2] ?? 0] as [number, number, number], atTimeMs: e.timeStamp }]);
            }
          };
        }
      };
      updateInputHandlers();
      try {
        const hasAdd = (access as unknown as { addEventListener?: (t: string, cb: () => void) => void }).addEventListener;
        if (typeof hasAdd === 'function') {
          hasAdd.call(access, 'statechange', updateInputHandlers);
        } else if (typeof access.onstatechange !== 'undefined') {
          access.onstatechange = updateInputHandlers;
        }
      } catch { /* ignore */ }
    };

    const requestMIDI = async () => {
      if (requesting || accessRef || !mounted) return;
      requesting = true;
      setStatusAll('requesting');
      try {
        const requestFn = navigator.requestMIDIAccess?.bind(navigator);
        if (typeof requestFn !== 'function') { setStatusAll('unsupported'); requesting = false; return; }
        const access = await requestFn({ sysex: false });
        if (!mounted) return;
        accessRef = access;
        attachHandlers(access);
      } catch (err) {
        const name = (err as { name?: string } | null | undefined)?.name || 'Error';
        const message = (err as { message?: string } | null | undefined)?.message || '';
        console.warn(STATUS_PREFIX, 'requestMIDIAccess failed', name, message);
        const classified = (name === 'NotAllowedError' || name === 'SecurityError') ? 'denied' : (name === 'TypeError' ? 'unsupported' : 'error');
        setStatusAll(classified);
        setErrorAll(name === 'TypeError' ? 'TypeError (maybe blocked flag or experimental feature disabled)' : name);
      } finally {
        requesting = false;
      }
    };

    // Listen for retry events from nodes
    const onRetry = () => { void requestMIDI(); };
    window.addEventListener('audioNodesRetryMIDI', onRetry);

    // Initial attempt (can be moved behind a user gesture if needed)
    void requestMIDI();

    return () => {
      mounted = false;
      window.removeEventListener('audioNodesRetryMIDI', onRetry);
    };
  }, [sendMIDI, setNodes]);

  return (
    <div className="h-screen w-screen relative bg-gray-900 overflow-hidden">
      {/* Startup overlay to initialize audio context */}
      {!audioInitialized && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-900/70 backdrop-blur-xl">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-xl max-w-sm w-[90%] text-center">
            <h2 className="title-font font-w-70 text-lg text-white mb-2">Initialize Audio</h2>
            <p className="text-sm text-gray-300 mb-4">Click to start the audio engine (required by browser autoplay policies).</p>
            <button
              onClick={() => { void initializeAudio(); }}
              className="px-4 py-2 rounded-lg font-medium bg-purple-600 hover:bg-purple-700 text-white w-full shadow"
            >
              Start Audio
            </button>
          </div>
        </div>
      )}
      <div className="absolute inset-0">
        <div className="absolute inset-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            proOptions={{ hideAttribution: true }}
            minZoom={0.03}
            maxZoom={3}
            className="react-flow-dark h-full w-full"
            isValidConnection={isValidConnection}
            onInit={(instance) => { rfInstanceRef.current = instance; }}
          >
            <MiniMap
              className="react-flow-minimap-dark !top-auto !right-auto bg-gray-800/80 backdrop-blur-md rounded-xl border border-gray-700/80 shadow"
              style={{ width: 288, height: 146 }}
              nodeBorderRadius={5}
              pannable
              zoomable
              offsetScale={0}
            />
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} className="bg-gray-900" />
          </ReactFlow>
        </div>
        <div className="absolute top-4 left-4 bottom-44 z-50 w-72 flex flex-col pointer-events-auto gap-4">
          <TitleBarCreds />
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
    </div>
  );
}
