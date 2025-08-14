"use client";
import React from 'react';
import { Sparkles } from 'lucide-react';
import { NodeShell } from '../node-framework/NodeShell';
import { NodeSpec } from '../node-framework/types';

interface ReverbNodeData {
    feedback?: number;
    wetMix?: number;
    _connectedParams?: string[];
    onParameterChange: (nodeId: string, key: string, value: unknown) => void;
    [k: string]: unknown;
}

interface ReverbNodeProps { id: string; selected?: boolean; data: ReverbNodeData; }

// Node-local spec & help metadata (kept here so everything unique to this node stays in this file)
const spec: NodeSpec = {
    type: 'reverb',
    title: 'Reverb',
    shortTitle: 'Reverb',
    // accentColor is overridden via registry in NodeShell, but provide fallback
    accentColor: '#3b82f6',
    params: [
        { key: 'feedback', kind: 'number', default: 0.3, min: 0, max: 0.95, step: 0.01, label: 'Feedback' },
        { key: 'wetMix', kind: 'number', default: 0.3, min: 0, max: 1, step: 0.01, label: 'Wet Mix' },
    ],
    inputs: [ { id: 'input', role: 'audio-in', label: 'Audio In' } ],
    outputs: [ { id: 'output', role: 'audio-out', label: 'Audio Out' } ],
    help: {
        description: 'Adds reverberation (echo/space) to the audio signal.',
        inputs: [
            { name: 'Audio In', description: 'Audio signal input.' },
            { name: 'Feedback', description: 'Amount of signal fed back into the effect.' },
            { name: 'Wet Mix', description: 'Balance between processed and dry signal.' },
        ],
        outputs: [
            { name: 'Audio Out', description: 'Processed audio signal.' }
        ]
    },
    icon: Sparkles
};

export default function ReverbNode({ id, data, selected }: ReverbNodeProps) {
    const { onParameterChange } = data;
    return <NodeShell id={id} data={data} spec={spec} selected={selected} onParameterChange={onParameterChange} />;
}
