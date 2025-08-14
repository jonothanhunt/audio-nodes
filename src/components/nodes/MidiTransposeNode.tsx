"use client";
import React from 'react';
import { ArrowUpDown } from 'lucide-react';
import { NodeShell } from '../node-framework/NodeShell';
import { NodeSpec } from '../node-framework/types';

interface MidiTransposeNodeData { semitones?: number; clampLow?: number; clampHigh?: number; passOther?: boolean; _connectedParams?: string[]; onParameterChange: (nodeId: string, key: string, value: unknown) => void; [k: string]: unknown; }
interface MidiTransposeNodeProps { id: string; selected?: boolean; data: MidiTransposeNodeData; }

const spec: NodeSpec = {
    type: 'midi-transpose',
    title: 'Transpose',
    accentColor: '#10b981',
    inputs: [ { id: 'midi', role: 'midi-in', label: 'MIDI In' } ],
    outputs: [ { id: 'midi-out', role: 'midi-out', label: 'MIDI Out' } ],
    params: [
        { key: 'semitones', kind: 'number', default: 0, min: -24, max: 24, step: 1, label: 'Semitones' },
        { key: 'clampLow', kind: 'number', default: 0, min: 0, max: 127, step: 1, label: 'Clamp Low' },
        { key: 'clampHigh', kind: 'number', default: 127, min: 0, max: 127, step: 1, label: 'Clamp High' },
        { key: 'passOther', kind: 'bool', default: true, label: 'Pass Other' },
    ],
    help: {
        description: 'Shift incoming MIDI note messages by a fixed number of semitones with optional range clamping.',
        inputs: [
            { name: 'MIDI In', description: 'Incoming MIDI events (notes and others).' },
            { name: 'Semitones', description: 'Transpose amount in semitones (-24 to +24).' },
            { name: 'Clamp Low / High', description: 'Limit resulting note numbers to this inclusive range.' },
            { name: 'Pass Other', description: 'If enabled non-note messages are forwarded unchanged.' }
        ],
        outputs: [ { name: 'MIDI Out', description: 'Transposed (and optionally clamped) MIDI note events.' } ]
    },
    icon: ArrowUpDown
};

export default function MidiTransposeNode({ id, data, selected }: MidiTransposeNodeProps) {
    const { onParameterChange } = data;
    return <NodeShell id={id} data={data} spec={spec} selected={selected} onParameterChange={onParameterChange} />;
}
