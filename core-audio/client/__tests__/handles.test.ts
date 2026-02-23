import { describe, it, expect } from 'vitest';
import { getHandleRole } from '../handles';

describe('getHandleRole', () => {
    // --- Audio nodes ---
    it('oscillator output → audio-out', () => {
        expect(getHandleRole('oscillator', 'output')).toBe('audio-out');
    });
    it('oscillator frequency → param-in', () => {
        expect(getHandleRole('oscillator', 'frequency')).toBe('param-in');
    });
    it('oscillator amplitude → param-in', () => {
        expect(getHandleRole('oscillator', 'amplitude')).toBe('param-in');
    });
    it('reverb input → audio-in', () => {
        expect(getHandleRole('reverb', 'input')).toBe('audio-in');
    });
    it('reverb output → audio-out', () => {
        expect(getHandleRole('reverb', 'output')).toBe('audio-out');
    });
    it('reverb feedback → param-in', () => {
        expect(getHandleRole('reverb', 'feedback')).toBe('param-in');
    });
    it('speaker input → audio-in', () => {
        expect(getHandleRole('speaker', 'input')).toBe('audio-in');
    });
    it('speaker volume → param-in', () => {
        expect(getHandleRole('speaker', 'volume')).toBe('param-in');
    });
    it('speaker muted → param-in', () => {
        expect(getHandleRole('speaker', 'muted')).toBe('param-in');
    });

    // --- MIDI nodes ---
    it('sequencer midi-out → midi-out', () => {
        expect(getHandleRole('sequencer', 'midi-out')).toBe('midi-out');
    });
    it('sequencer playing → param-in', () => {
        expect(getHandleRole('sequencer', 'playing')).toBe('param-in');
    });
    it('synth midi → midi-in', () => {
        expect(getHandleRole('synth', 'midi')).toBe('midi-in');
    });
    it('midi-input midi → midi-out', () => {
        expect(getHandleRole('midi-input', 'midi')).toBe('midi-out');
    });
    it('midi-transpose midi → midi-in', () => {
        expect(getHandleRole('midi-transpose', 'midi')).toBe('midi-in');
    });
    it('midi-transpose midi-out → midi-out', () => {
        expect(getHandleRole('midi-transpose', 'midi-out')).toBe('midi-out');
    });
    it('arpeggiator midi-in → midi-in', () => {
        expect(getHandleRole('arpeggiator', 'midi-in')).toBe('midi-in');
    });
    it('arpeggiator playing → param-in', () => {
        expect(getHandleRole('arpeggiator', 'playing')).toBe('param-in');
    });

    // --- Value nodes ---
    it('value-bool param-out → param-out', () => {
        expect(getHandleRole('value-bool', 'param-out')).toBe('param-out');
    });
    it('value-bool null handle → param-out (default)', () => {
        expect(getHandleRole('value-bool', undefined)).toBe('param-out');
    });
    it('value-bool value → param-in (allows chaining)', () => {
        expect(getHandleRole('value-bool', 'value')).toBe('param-in');
    });
    it('value-number param-out → param-out', () => {
        expect(getHandleRole('value-number', 'param-out')).toBe('param-out');
    });
    it('lfo output → param-out', () => {
        expect(getHandleRole('lfo', 'output')).toBe('param-out');
    });
    it('lfo beatsPerCycle → param-in', () => {
        expect(getHandleRole('lfo', 'beatsPerCycle')).toBe('param-in');
    });

    // --- Edge cases ---
    it('unknown type → unknown', () => {
        expect(getHandleRole('made-up-node', 'output')).toBe('unknown');
    });
    it('undefined type → unknown', () => {
        expect(getHandleRole(undefined, 'output')).toBe('unknown');
    });
    it('wrong handleId → unknown', () => {
        expect(getHandleRole('oscillator', 'nonexistent')).toBe('unknown');
    });
});
