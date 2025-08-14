"use client";
import React from 'react';
import { Volume2 } from 'lucide-react';
import { NodeShell } from '../node-framework/NodeShell';
import { NodeSpec } from '../node-framework/types';

interface SynthNodeData { preset?: string; waveform?: string; attack?: number; decay?: number; sustain?: number; release?: number; cutoff?: number; resonance?: number; glide?: number; gain?: number; maxVoices?: number; _connectedParams?: string[]; onParameterChange: (nodeId: string, key: string, value: unknown) => void; [k: string]: unknown; }
interface SynthNodeProps { id: string; selected?: boolean; data: SynthNodeData; }

const spec: NodeSpec = {
    type: 'synth',
    title: 'Synth',
    accentColor: '#ec4899',
    inputs: [ { id: 'midi', role: 'midi-in', label: 'MIDI In' } ],
    outputs: [ { id: 'output', role: 'audio-out', label: 'Audio Out' } ],
    params: [
        { key: 'preset', kind: 'select', default: 'Init', options: ['Init','Pluck','Pad','Bass'], label: 'Preset' },
        { key: 'waveform', kind: 'select', default: 'sawtooth', options: ['sine','sawtooth','square','triangle'], label: 'Waveform' },
        { key: 'attack', kind: 'number', default: 0.005, min: 0, step: 0.001, label: 'Attack' },
        { key: 'decay', kind: 'number', default: 0.12, min: 0, step: 0.001, label: 'Decay' },
        { key: 'sustain', kind: 'number', default: 0.7, min: 0, max: 1, step: 0.01, label: 'Sustain' },
        { key: 'release', kind: 'number', default: 0.12, min: 0, step: 0.001, label: 'Release' },
        { key: 'cutoff', kind: 'number', default: 10000, min: 20, max: 20000, step: 1, label: 'Cutoff', badge: 'Hz' },
        { key: 'resonance', kind: 'number', default: 0.2, min: 0, max: 1, step: 0.01, label: 'Resonance' },
        { key: 'glide', kind: 'number', default: 0, min: 0, step: 1, label: 'Glide' },
        { key: 'gain', kind: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'Gain' },
        { key: 'maxVoices', kind: 'number', default: 8, min: 1, max: 32, step: 1, label: 'Voices' }
    ],
    help: {
        description: 'Polyphonic subtractive synthesizer with ADSR envelope, filter and glide.',
        inputs: [
            { name: 'MIDI In', description: 'Incoming MIDI note events.' },
            { name: 'Preset', description: 'Preset patch selection.' },
            { name: 'Waveform', description: 'Primary oscillator waveform.' },
            { name: 'Attack/Decay/Sustain/Release', description: 'Amplitude envelope parameters.' },
            { name: 'Cutoff/Resonance', description: 'Filter frequency and resonance.' },
            { name: 'Glide', description: 'Portamento time between notes.' },
            { name: 'Gain', description: 'Output level.' },
            { name: 'Voices', description: 'Maximum simultaneous polyphony.' }
        ],
        outputs: [ { name: 'Audio Out', description: 'Synth audio output.' } ]
    },
    icon: Volume2
};

export default function SynthesizerNode({ id, data, selected }: SynthNodeProps) {
    const { onParameterChange } = data;
    return <NodeShell id={id} data={data} spec={spec} selected={selected} onParameterChange={onParameterChange} />;
}
