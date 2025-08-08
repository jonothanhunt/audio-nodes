'use client';

import React from 'react';
import { Handle, Position } from 'reactflow';
import { Waves } from 'lucide-react';

interface ReverbNodeProps {
  id: string;
  data: {
    feedback: number;
    wetMix: number;
    onParameterChange: (nodeId: string, parameter: string, value: string | number) => void;
  };
}

export default function ReverbNode({ id, data }: ReverbNodeProps) {
  const { feedback, wetMix, onParameterChange } = data;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 min-w-48 shadow-lg">
      {/* Node Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
        <Waves className="w-4 h-4 text-blue-400" />
        <span className="text-blue-300 text-sm font-medium">Reverb</span>
        <div className="ml-auto">
          <span className="text-xs text-gray-500 bg-blue-900/30 px-2 py-1 rounded">
            effect
          </span>
        </div>
      </div>

      {/* Node ID */}
      <div className="text-xs text-gray-500 mb-3">ID: {id}</div>

      {/* Parameters */}
      <div className="space-y-3">
        {/* Feedback */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Feedback</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={feedback}
              onChange={(e) =>
                onParameterChange(id, 'feedback', parseFloat(e.target.value))
              }
              className="bg-gray-800 border-l-4 border-l-blue-500 border-r border-t border-b border-gray-600 rounded px-2 py-1 text-sm text-white w-20 text-center"
              min="0"
              max="0.95"
              step="0.05"
            />
          </div>
        </div>

        {/* Wet Mix */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Wet Mix</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={wetMix}
              onChange={(e) =>
                onParameterChange(id, 'wetMix', parseFloat(e.target.value))
              }
              className="bg-gray-800 border-l-4 border-l-blue-500 border-r border-t border-b border-gray-600 rounded px-2 py-1 text-sm text-white w-20 text-center"
              min="0"
              max="1"
              step="0.1"
            />
          </div>
        </div>
      </div>

      {/* Input/Output indicators */}
      <div className="mt-4 flex justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-purple-500 border-2 border-purple-300"></div>
          <span className="text-xs text-gray-400">Input</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Output</span>
          <div className="w-3 h-3 rounded-full bg-purple-500 border-2 border-purple-300"></div>
        </div>
      </div>

      {/* React Flow Handles - evenly distributed */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="!w-3 !h-3 !bg-purple-500 !border-2 !border-purple-300"
        style={{ top: '25%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="feedback"
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-blue-300"
        style={{ top: '50%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="wetMix"
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-blue-300"
        style={{ top: '75%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="!w-3 !h-3 !bg-purple-500 !border-2 !border-purple-300"
        style={{ top: '50%' }}
      />
    </div>
  );
}
