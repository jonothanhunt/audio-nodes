"use client";
import React from 'react';
import { Volume2 } from 'lucide-react';
import { NodeShell } from '../node-framework/NodeShell';
import { NodeSpec } from '../node-framework/types';

interface OscillatorNodeData { frequency?: number; amplitude?: number; waveform?: string; _connectedParams?: string[]; onParameterChange: (nodeId: string, key: string, value: unknown) => void; [k: string]: unknown; }
interface OscillatorNodeProps { id: string; selected?: boolean; data: OscillatorNodeData; }

const spec: NodeSpec = {
    type: 'oscillator',
        title: 'Oscillator',
        shortTitle: 'Oscillator',
    accentColor: '#6366f1',
    params: [
        { key: 'frequency', kind: 'number', default: 440, min: 20, max: 2000, step: 1, label: 'Frequency', description: 'Pitch in Hz', badge: 'Hz' },
        { key: 'amplitude', kind: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'Amplitude', description: 'Output level 0-1' },
        { key: 'waveform', kind: 'select', default: 'sine', options: ['sine','square','sawtooth','triangle'], label: 'Waveform' },
    ],
    outputs: [ { id: 'output', role: 'audio-out', label: 'Audio Out' } ],
    help: {
        description: 'Basic oscillator with frequency, amplitude and waveform controls.',
        inputs: [
            { name: 'Frequency', description: 'Pitch of the waveform (Hz).' },
            { name: 'Amplitude', description: 'Output level (0–1).' },
            { name: 'Waveform', description: 'Shape of the generated signal.' },
        ],
        outputs: [ { name: 'Audio Out', description: 'Oscillator audio signal.' } ]
    },
    icon: Volume2
};

export default function OscillatorNode({ id, data, selected }: OscillatorNodeProps) {
    const { onParameterChange } = data;
    return <NodeShell id={id} data={data} spec={spec} selected={selected} onParameterChange={onParameterChange} />;
}
