"use client";
import React from 'react';
import { NodeShell } from '../node-framework/NodeShell';
import { NodeSpec } from '../node-framework/types';

interface SpeakerNodeData { volume?: number; muted?: boolean; _connectedParams?: string[]; onParameterChange: (nodeId: string, key: string, value: unknown) => void; [k: string]: unknown; }
interface SpeakerNodeProps { id: string; selected?: boolean; data: SpeakerNodeData; }

const spec: NodeSpec = {
    type: 'speaker',
    // title omitted (registry provides)
    // accentColor & icon centralized in registry
    inputs: [ { id: 'input', role: 'audio-in', label: 'Audio In' } ],
    params: [
        { key: 'volume', kind: 'number', default: 0.8, min: 0, max: 1, step: 0.01, label: 'Volume' },
        { key: 'muted', kind: 'bool', default: false, label: 'Muted' }
    ],
    help: {
        description: 'Final output node controlling overall volume and mute state.',
        inputs: [
            { name: 'Audio In', description: 'Audio stream to be played.' },
            { name: 'Volume', description: 'Output level (0–1).' },
            { name: 'Muted', description: 'Toggle the output on/off.' }
        ],
        outputs: []
    },
    // icon centralized in registry
};

export default function SpeakerNode({ id, data, selected }: SpeakerNodeProps) {
    const { onParameterChange } = data;
    return <NodeShell id={id} data={data} spec={spec} selected={selected} onParameterChange={onParameterChange} />;
}
