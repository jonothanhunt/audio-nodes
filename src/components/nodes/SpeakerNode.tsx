'use client';

import React from 'react';
import { Handle, Position } from 'reactflow';
import { Speaker } from 'lucide-react';

interface SpeakerNodeProps {
  id: string;
  data: {
    volume: number;
    muted: boolean;
    onParameterChange: (nodeId: string, parameter: string, value: string | number | boolean) => void;
  };
}

export default function SpeakerNode({ id, data }: SpeakerNodeProps) {
  const { volume, muted, onParameterChange } = data;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 min-w-48 shadow-lg">
      {/* Node Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-3 h-3 rounded-full bg-green-500"></div>
        <Speaker className="w-4 h-4 text-green-400" />
        <span className="text-green-300 text-sm font-medium">Speaker</span>
        <div className="ml-auto">
          <span className="text-xs text-gray-500 bg-green-900/30 px-2 py-1 rounded">
            utility
          </span>
        </div>
      </div>

      {/* Node ID */}
      <div className="text-xs text-gray-500 mb-3">ID: {id}</div>

      {/* Parameters */}
      <div className="space-y-3">
        {/* Volume */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Volume</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={volume}
              onChange={(e) =>
                onParameterChange(id, 'volume', parseFloat(e.target.value))
              }
              className="bg-gray-800 border-l-4 border-l-blue-500 border-r border-t border-b border-gray-600 rounded px-2 py-1 text-sm text-white w-20 text-center"
              min="0"
              max="1"
              step="0.1"
            />
          </div>
        </div>

        {/* Muted */}
        <div>
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={muted}
              onChange={(e) =>
                onParameterChange(id, 'muted', e.target.checked)
              }
              className="bg-gray-800 border border-gray-600 rounded"
            />
            Muted
          </label>
        </div>
      </div>

      {/* Input indicator */}
      <div className="mt-4 flex justify-start">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-purple-500 border-2 border-purple-300"></div>
          <span className="text-xs text-gray-400">Audio In → Speakers</span>
        </div>
      </div>

      {/* React Flow Handles - only inputs for speaker */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="!w-3 !h-3 !bg-purple-500 !border-2 !border-purple-300"
        style={{ top: '50%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="volume"
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-blue-300"
        style={{ top: '75%' }}
      />
    </div>
  );
}
