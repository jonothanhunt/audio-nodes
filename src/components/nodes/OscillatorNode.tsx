'use client';

import React from 'react';
import { Handle, Position } from 'reactflow';
import { Volume2 } from 'lucide-react';

interface OscillatorNodeProps {
  id: string;
  data: {
    frequency: number;
    amplitude: number;
    waveform: string;
    onParameterChange: (nodeId: string, parameter: string, value: string | number) => void;
  };
}

const waveforms = [
  { value: 'sine', label: 'Sine' },
  { value: 'square', label: 'Square' },
  { value: 'sawtooth', label: 'Sawtooth' },
  { value: 'triangle', label: 'Triangle' },
];

export default function OscillatorNode({ id, data }: OscillatorNodeProps) {
  const { frequency, amplitude, waveform, onParameterChange } = data;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 min-w-48 shadow-lg">
      {/* Node Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-3 h-3 rounded-full bg-purple-500"></div>
        <Volume2 className="w-4 h-4 text-purple-400" />
        <span className="text-purple-300 text-sm font-medium">Oscillator</span>
        <div className="ml-auto">
          <span className="text-xs text-gray-500 bg-purple-900/30 px-2 py-1 rounded">
            synthesis
          </span>
        </div>
      </div>

      {/* Node ID */}
      <div className="text-xs text-gray-500 mb-3">ID: {id}</div>

      {/* Parameters */}
      <div className="space-y-3">
        {/* Frequency */}
        <div className="relative">
          <label className="block text-xs text-gray-400 mb-1">Frequency</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={frequency}
              onChange={(e) =>
                onParameterChange(id, 'frequency', parseFloat(e.target.value))
              }
              className="bg-gray-800 border-l-4 border-l-blue-500 border-r border-t border-b border-gray-600 rounded px-2 py-1 text-sm text-white w-20 text-center"
              min="20"
              max="2000"
            />
            <span className="text-xs text-gray-500">Hz</span>
          </div>
        </div>

        {/* Amplitude */}
        <div className="relative">
          <label className="block text-xs text-gray-400 mb-1">Amplitude</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={amplitude}
              onChange={(e) =>
                onParameterChange(id, 'amplitude', parseFloat(e.target.value))
              }
              className="bg-gray-800 border-l-4 border-l-blue-500 border-r border-t border-b border-gray-600 rounded px-2 py-1 text-sm text-white w-20 text-center"
              min="0"
              max="1"
              step="0.1"
            />
          </div>
        </div>

        {/* Waveform */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Waveform</label>
          <select
            value={waveform}
            onChange={(e) => onParameterChange(id, 'waveform', e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white w-full"
          >
            {waveforms.map((wf) => (
              <option key={wf.value} value={wf.value}>
                {wf.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Output indicator */}
      <div className="mt-4 flex justify-end">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Output</span>
          <div className="w-3 h-3 rounded-full bg-purple-500 border-2 border-purple-300"></div>
        </div>
      </div>

      {/* React Flow Handles - evenly distributed */}
      <Handle
        type="target"
        position={Position.Left}
        id="frequency"
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-blue-300"
        style={{ top: '33%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="amplitude"
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-blue-300"
        style={{ top: '66%' }}
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
