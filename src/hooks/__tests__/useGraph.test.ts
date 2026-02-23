import { describe, it, expect } from 'vitest';
import { getHandleRole, HandleRole } from '@core-audio/client/handles';

// Pure connection validator extracted from useGraph for testability.
// Mirrors the logic in isValidConnection but without React hook deps.
function validateConnection(
    connection: {
        source: string | null;
        target: string | null;
        sourceHandle: string | null;
        targetHandle: string | null;
    },
    nodes: Array<{ id: string; type: string }>,
    edges: Array<{ target: string; targetHandle: string | null }>,
): boolean {
    if (connection.source != null && connection.target != null && connection.source === connection.target) return false;
    const sourceNode = nodes.find(n => n.id === connection.source);
    const targetNode = nodes.find(n => n.id === connection.target);
    if (!sourceNode || !targetNode) return false;

    const fromRole: HandleRole = getHandleRole(sourceNode.type, connection.sourceHandle ?? undefined);
    const toRole: HandleRole = getHandleRole(targetNode.type, connection.targetHandle ?? undefined);

    const audioOk = fromRole === 'audio-out' && toRole === 'audio-in';
    const midiOk = fromRole === 'midi-out' && toRole === 'midi-in';
    const paramOk = fromRole === 'param-out' && toRole === 'param-in';
    if (!audioOk && !midiOk && !paramOk) return false;

    // MIDI and param inputs are single-source only; audio allows fan-in
    if (midiOk || paramOk) {
        const alreadyConnected = edges.some(
            e => e.target === connection.target && e.targetHandle === connection.targetHandle,
        );
        if (alreadyConnected) return false;
    }
    return true;
}

const nodes = [
    { id: 'osc', type: 'oscillator' },
    { id: 'rev', type: 'reverb' },
    { id: 'spk', type: 'speaker' },
    { id: 'syn', type: 'synth' },
    { id: 'seq', type: 'sequencer' },
    { id: 'bool', type: 'value-bool' },
    { id: 'lfo', type: 'lfo' },
    { id: 'mid', type: 'midi-input' },
];

describe('isValidConnection (pure logic)', () => {
    it('allows audio-out → audio-in (osc → reverb)', () => {
        expect(validateConnection(
            { source: 'osc', target: 'rev', sourceHandle: 'output', targetHandle: 'input' },
            nodes, []
        )).toBe(true);
    });

    it('allows audio fan-in (two oscillators → same reverb input)', () => {
        const osc2 = { id: 'osc2', type: 'oscillator' };
        const existingEdge = { target: 'rev', targetHandle: 'input' };
        expect(validateConnection(
            { source: 'osc2', target: 'rev', sourceHandle: 'output', targetHandle: 'input' },
            [...nodes, osc2], [existingEdge]
        )).toBe(true);
    });

    it('allows midi-out → midi-in (midi-input → synth)', () => {
        expect(validateConnection(
            { source: 'mid', target: 'syn', sourceHandle: 'midi', targetHandle: 'midi' },
            nodes, []
        )).toBe(true);
    });

    it('allows param-out → param-in (bool → sequencer playing)', () => {
        expect(validateConnection(
            { source: 'bool', target: 'seq', sourceHandle: 'param-out', targetHandle: 'playing' },
            nodes, []
        )).toBe(true);
    });

    it('allows param-out → param-in (lfo → oscillator frequency)', () => {
        expect(validateConnection(
            { source: 'lfo', target: 'osc', sourceHandle: 'output', targetHandle: 'frequency' },
            nodes, []
        )).toBe(true);
    });

    it('blocks self-connection', () => {
        expect(validateConnection(
            { source: 'osc', target: 'osc', sourceHandle: 'output', targetHandle: null },
            nodes, []
        )).toBe(false);
    });

    it('blocks type mismatch (audio-out → midi-in)', () => {
        expect(validateConnection(
            { source: 'osc', target: 'syn', sourceHandle: 'output', targetHandle: 'midi' },
            nodes, []
        )).toBe(false);
    });

    it('blocks second param connection to same handle (single-source rule)', () => {
        const existingEdge = { target: 'seq', targetHandle: 'playing' };
        expect(validateConnection(
            { source: 'bool', target: 'seq', sourceHandle: 'param-out', targetHandle: 'playing' },
            nodes, [existingEdge]
        )).toBe(false);
    });

    it('blocks second MIDI connection to same handle (single-source rule)', () => {
        const existingEdge = { target: 'syn', targetHandle: 'midi' };
        expect(validateConnection(
            { source: 'mid', target: 'syn', sourceHandle: 'midi', targetHandle: 'midi' },
            nodes, [existingEdge]
        )).toBe(false);
    });

    it('blocks connection to unknown node', () => {
        expect(validateConnection(
            { source: 'ghost', target: 'osc', sourceHandle: 'output', targetHandle: 'frequency' },
            nodes, []
        )).toBe(false);
    });
});
