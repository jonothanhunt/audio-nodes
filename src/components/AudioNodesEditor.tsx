'use client';

import React, { useCallback, useState } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
} from 'reactflow';
import 'reactflow/dist/style.css';

import NodeLibrary from '@/components/NodeLibrary';
import OscillatorNode from '@/components/nodes/OscillatorNode';
import ReverbNode from '@/components/nodes/ReverbNode';
import SpeakerNode from '@/components/nodes/SpeakerNode';
import SequencerNode from '@/components/nodes/SequencerNode';
import { AudioManager } from '@/lib/audioManager';

// Map handle ids to semantic roles so we can validate connections
function getHandleRole(nodeType: string | undefined, handleId: string | undefined): 'audio-in' | 'audio-out' | 'param-in' | 'midi-out' | 'unknown' {
  switch (nodeType) {
    case 'oscillator':
      if (handleId === 'output') return 'audio-out';
      if (handleId === 'frequency' || handleId === 'amplitude') return 'param-in';
      return 'unknown';
    case 'reverb':
      if (handleId === 'input') return 'audio-in';
      if (handleId === 'output') return 'audio-out';
      if (handleId === 'feedback' || handleId === 'wetMix') return 'param-in';
      return 'unknown';
    case 'speaker':
      if (handleId === 'input') return 'audio-in';
      if (handleId === 'volume') return 'param-in';
      return 'unknown';
    case 'sequencer':
      if (handleId === 'midi') return 'midi-out';
      if (handleId === 'play') return 'param-in';
      if (handleId === 'bpm') return 'param-in';
      return 'unknown';
    default:
      return 'unknown';
  }
}

// Define custom node types outside component to avoid React Flow warning
const nodeTypes = {
  oscillator: OscillatorNode,
  reverb: ReverbNode,
  speaker: SpeakerNode,
  sequencer: SequencerNode,
};

// Initial node configurations
const initialNodes: Node[] = [
  {
    id: '1',
    type: 'oscillator',
    position: { x: 100, y: 100 },
    data: {
      frequency: 440,
      amplitude: 0.5,
      waveform: 'sine',
      onParameterChange: () => {},
    },
  },
  {
    id: '2',
    type: 'reverb',
    position: { x: 400, y: 100 },
    data: {
      feedback: 0.3,
      wetMix: 0.3,
      onParameterChange: () => {},
    },
  },
  {
    id: '3',
    type: 'speaker',
    position: { x: 700, y: 100 },
    data: {
      volume: 0.8,
      muted: false,
      onParameterChange: () => {},
    },
  },
  {
    id: '4',
    type: 'sequencer',
    position: { x: 100, y: 300 },
    data: {
      length: 16,
      octaves: 1,
      onParameterChange: () => {},
    },
  },
];

const initialEdges: Edge[] = [];

export default function AudioNodesEditor() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [wasmReady, setWasmReady] = useState(false);
  const [audioManager] = useState(() => new AudioManager());

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
  const handleParameterChange = useCallback((nodeId: string, parameter: string, value: string | number | boolean) => {
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
            type: node.type || 'unknown',
            ...updatedNode.data,
          });
          
          return updatedNode;
        }
        return node;
      })
    );
  }, [setNodes, audioManager]);

  // Update audio nodes when nodes change
  React.useEffect(() => {
    // Initialize all nodes in the audio manager
    nodes.forEach(node => {
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
    const connections = edges.map(edge => ({
      from: edge.source,
      to: edge.target,
      fromOutput: edge.sourceHandle || 'output',
      toInput: edge.targetHandle || 'input'
    }));
    audioManager.updateConnections(connections);
    console.log('Updated audio connections:', connections);
  }, [edges, audioManager]);

  // Update initial nodes with the parameter change handler and register them with audio manager
  React.useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onParameterChange: handleParameterChange,
        },
      }))
    );

    // Register initial nodes with audio manager
    initialNodes.forEach((node) => {
      audioManager.updateNode(node.id, {
        type: node.type || 'unknown',
        ...node.data,
      });
    });
  }, [handleParameterChange, setNodes, audioManager]);

  // Validate that only audio-out -> audio-in connections are allowed (and reserve midi/event for future)
  const isValidConnection = useCallback((connection: Connection) => {
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);
    if (!sourceNode || !targetNode) return false;

    const fromRole = getHandleRole(sourceNode.type, connection.sourceHandle || undefined);
    const toRole = getHandleRole(targetNode.type, connection.targetHandle || undefined);

    return fromRole === 'audio-out' && toRole === 'audio-in';
  }, [nodes]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => (isValidConnection(params) ? addEdge(params, eds) : eds)),
    [setEdges, isValidConnection]
  );

  const onAddNode = useCallback((type: string) => {
    const newNode: Node = {
      id: `${nodes.length + 1}`,
      type,
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      data: getDefaultNodeData(type, handleParameterChange),
    };
    setNodes((nds) => [...nds, newNode]);
  }, [nodes.length, setNodes, handleParameterChange]);

  const handleInitializeAudio = useCallback(async () => {
    try {
      const success = await audioManager.initializeAudio();
      if (success) {
        setAudioInitialized(true);
        console.log('Audio system initialized and ready');
      } else {
        console.error('Failed to initialize audio system');
      }
    } catch (error) {
      console.error('Error initializing audio:', error);
    }
  }, [audioManager]);

  return (
    <div className="h-screen flex bg-gray-900">
      {/* Node Library Sidebar */}
      <NodeLibrary onAddNode={onAddNode} />

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="bg-gray-800 border-b border-gray-700 p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-white">AudioNodes</h1>
            <span className="text-sm text-gray-400">Visual Audio Programming</span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                audioInitialized 
                  ? 'bg-green-500' 
                  : wasmReady 
                    ? 'bg-blue-500' 
                    : 'bg-yellow-500'
              }`}></div>
              <span className="text-xs text-gray-400">
                {audioInitialized 
                  ? 'Audio Ready' 
                  : wasmReady 
                    ? 'Engine Ready' 
                    : 'Idle'}
              </span>
            </div>
            
            {!audioInitialized && (
              <button
                onClick={handleInitializeAudio}
                className={`px-4 py-2 rounded-lg font-medium transition-colors bg-blue-600 hover:bg-blue-700 text-white`}
              >
                Initialize Audio
              </button>
            )}
            
            <div className="text-sm text-gray-400">
              BPM: <span className="text-white">120</span>
            </div>
          </div>
        </div>

        {/* React Flow Canvas */}
        <div className="flex-1 bg-gray-900">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            proOptions={{ hideAttribution: true }}
            fitView
            className="react-flow-dark"
            isValidConnection={isValidConnection}
          >
            <Controls className="react-flow-controls-dark" />
            <MiniMap className="react-flow-minimap-dark" />
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} className="bg-gray-900" />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}

// Helper function to get default data for new nodes
function getDefaultNodeData(type: string, onParameterChange: (nodeId: string, parameter: string, value: string | number | boolean) => void) {
  switch (type) {
    case 'oscillator':
      return {
        frequency: 440,
        amplitude: 0.5,
        waveform: 'sine',
        onParameterChange,
      };
    case 'reverb':
      return {
        feedback: 0.3,
        wetMix: 0.3,
        onParameterChange,
      };
    case 'speaker':
      return {
        volume: 0.8,
        muted: false,
        onParameterChange,
      };
    case 'sequencer':
      return {
        length: 16,
        octaves: 1,
        onParameterChange,
      };
    default:
      return { onParameterChange };
  }
}
