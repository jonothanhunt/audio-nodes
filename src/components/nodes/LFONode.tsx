"use client";
import React from 'react';
import { Waves } from 'lucide-react';
import { NodeShell } from '../node-framework/NodeShell';
import { NodeSpec } from '../node-framework/types';

interface LFONodeData { waveform?: string; beatsPerCycle?: number; depth?: number; offset?: number; bipolar?: boolean; phase?: number; onParameterChange: (nodeId: string, key: string, value: unknown) => void; [k:string]: unknown; }
interface LFONodeProps { id: string; selected?: boolean; data: LFONodeData; }

const spec: NodeSpec = {
  type: 'lfo',
  title: 'LFO',
  shortTitle: 'LFO',
  accentColor: '#10b981',
  params: [
    { key: 'waveform', kind: 'select', default: 'sine', options: ['sine','triangle','saw','square'], label: 'Waveform' },
    { key: 'beatsPerCycle', kind: 'number', default: 1, min: 0.0625, max: 64, step: 0.0625, label: 'Beats/Cycle', description: 'LFO period length in beats' },
    { key: 'depth', kind: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'Depth' },
    { key: 'offset', kind: 'number', default: 0, min: -1, max: 1, step: 0.01, label: 'Offset' },
    { key: 'bipolar', kind: 'bool', default: true, label: 'Bipolar' },
    { key: 'phase', kind: 'number', default: 0, min: 0, max: 1, step: 0.01, label: 'Phase' },
  ],
  outputs: [ { id: 'output', role: 'param-out', label: 'LFO Out' } ],
  help: {
    description: 'Beat-synced low frequency oscillator for parameter modulation.',
    inputs: [
      { name: 'Waveform', description: 'Shape of modulation signal.' },
      { name: 'Beats/Cycle', description: 'Duration of one LFO cycle in beats.' },
      { name: 'Depth', description: 'Scales the raw waveform amplitude.' },
      { name: 'Offset', description: 'Adds constant offset after depth scaling.' },
      { name: 'Bipolar', description: 'If off, maps [-1,1] to [0,1].' },
      { name: 'Phase', description: 'Initial phase offset (0-1).' },
    ],
    outputs: [ { name: 'LFO Out', description: 'Current modulation value (number).' } ]
  },
  icon: Waves
};

export default function LFONode({ id, data, selected }: LFONodeProps) {
  const { onParameterChange } = data;
  return <NodeShell id={id} data={data} spec={spec} selected={selected} onParameterChange={onParameterChange} />;
}
