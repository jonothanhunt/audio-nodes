import { describe, it, expect, beforeEach } from 'vitest';
import {
    audioEdge,
    BLOCK_SIZE,
    createEngine,
    FakeOscillator,
    FakeReverb,
    FakeSynth,
    midiEdge,
    paramEdge,
    peak,
    type Engine,
} from './harness';

/**
 * Specs for the worklet's render path, driving the compiled processor through its real
 * message port. Each block below pins one of the findings in docs/AUDIO-AUDIT.md.
 */

let engine: Engine;

beforeEach(async () => {
    engine = await createEngine();
});

/** Standard three-node patch: oscillator → speaker. */
function oscToSpeaker() {
    engine.setNode('osc', { type: 'oscillator', frequency: 440, amplitude: 0.5 });
    engine.setNode('spk', { type: 'speaker', volume: 1, muted: false });
    engine.setConnections([audioEdge('osc', 'spk')]);
}

describe('B1 — fan-out renders each node once per block', () => {
    it('advances a node feeding two destinations only once (no octave-up bug)', () => {
        engine.setNode('osc', { type: 'oscillator', frequency: 440, amplitude: 1 });
        engine.setNode('rev', { type: 'reverb', feedback: 0, wetMix: 1 });
        engine.setNode('spk', { type: 'speaker', volume: 1, muted: false });
        // The oscillator feeds the speaker both directly and through the reverb.
        engine.setConnections([
            audioEdge('osc', 'rev'),
            audioEdge('rev', 'spk'),
            audioEdge('osc', 'spk'),
        ]);

        engine.render();

        const osc = FakeOscillator.instances[0];
        expect(osc.processCalls).toBe(1);
        // The fake oscillator's counter is its phase. One block must advance it by exactly
        // one block's worth of samples; twice that is the pitch-doubling regression.
        expect(osc.counter).toBe(BLOCK_SIZE);
    });

    it('still renders once when three consumers share a source', () => {
        engine.setNode('osc', { type: 'oscillator', frequency: 440, amplitude: 1 });
        engine.setNode('revA', { type: 'reverb', feedback: 0, wetMix: 1 });
        engine.setNode('revB', { type: 'reverb', feedback: 0, wetMix: 1 });
        engine.setNode('spk', { type: 'speaker', volume: 1, muted: false });
        engine.setConnections([
            audioEdge('osc', 'revA'),
            audioEdge('osc', 'revB'),
            audioEdge('osc', 'spk'),
            audioEdge('revA', 'spk'),
            audioEdge('revB', 'spk'),
        ]);

        engine.render();

        expect(FakeOscillator.instances[0].processCalls).toBe(1);
        expect(FakeOscillator.instances[0].counter).toBe(BLOCK_SIZE);
    });

    it('does not hang on a feedback loop in the patch', () => {
        engine.setNode('revA', { type: 'reverb', feedback: 0.5, wetMix: 1 });
        engine.setNode('revB', { type: 'reverb', feedback: 0.5, wetMix: 1 });
        engine.setNode('spk', { type: 'speaker', volume: 1, muted: false });
        engine.setConnections([
            audioEdge('revA', 'revB'),
            audioEdge('revB', 'revA'), // cycle
            audioEdge('revB', 'spk'),
        ]);

        expect(() => engine.render()).not.toThrow();
        expect(engine.port.postedOfType('error')).toHaveLength(0);
    });
});

describe('B2 — nested reverbs do not share an input buffer', () => {
    it('gives the outer reverb its full input', () => {
        engine.setNode('osc', { type: 'oscillator', frequency: 440, amplitude: 1 });
        engine.setNode('inner', { type: 'reverb', feedback: 0, wetMix: 1 });
        engine.setNode('outer', { type: 'reverb', feedback: 0, wetMix: 1 });
        engine.setNode('spk', { type: 'speaker', volume: 1, muted: false });
        // osc → inner → outer → speaker
        engine.setConnections([
            audioEdge('osc', 'inner'),
            audioEdge('inner', 'outer'),
            audioEdge('outer', 'spk'),
        ]);

        // Render past the entry fades so the comparison measures routing, not ramping.
        engine.renderBlocks(60);

        const [inner, outer] = FakeReverb.instances;
        expect(inner.processCalls).toBe(60);
        expect(outer.processCalls).toBe(60);
        // The fakes pass their input straight through, so the outer reverb should see what
        // the inner one produced. With a shared scratch buffer the inner call zeroed the
        // buffer the outer was accumulating into and the outer reverb saw pure silence.
        // (The two are not bit-identical: each stage applies its own asymptotic fade gain.)
        const innerPeak = peak(new Float32Array(inner.lastInput));
        const outerPeak = peak(new Float32Array(outer.lastInput));
        expect(innerPeak).toBeGreaterThan(0.9);
        expect(outerPeak).toBeGreaterThan(0.9);
        expect(outerPeak).toBeCloseTo(innerPeak, 3);
    });
});

describe('A1 — speaker gain is ramped, not stepped', () => {
    it('fades on mute instead of cutting to zero in one sample', () => {
        oscToSpeaker();
        // Let the node fade-in settle so we are measuring the mute, not the entrance.
        engine.renderBlocks(40);

        engine.setNode('spk', { type: 'speaker', volume: 1, muted: true });
        const { left } = engine.render();

        // Mid-fade: quieter than before but not yet silent. A stepped gain would make the
        // whole block exactly zero.
        expect(peak(left)).toBeGreaterThan(0);
        expect(Math.abs(left[BLOCK_SIZE - 1])).toBeLessThan(Math.abs(left[0]));
    });

    it('reaches silence once the fade completes', () => {
        oscToSpeaker();
        engine.renderBlocks(40);
        engine.setNode('spk', { type: 'speaker', volume: 1, muted: true });

        const { left } = engine.renderBlocks(60);
        expect(peak(left)).toBeLessThan(1e-3);
    });

    it('does not fade in a speaker that starts unmuted', () => {
        // Loading a saved project should come up at level, not swell in.
        oscToSpeaker();
        engine.renderBlocks(60);
        const { left } = engine.render();
        expect(peak(left)).toBeGreaterThan(0);
    });
});

describe('A3 — nodes fade in and out of the mix', () => {
    it('ramps a newly connected node up from silence', () => {
        engine.setNode('osc', { type: 'oscillator', frequency: 440, amplitude: 1 });
        engine.setNode('spk', { type: 'speaker', volume: 1, muted: false });
        engine.setConnections([audioEdge('osc', 'spk')]);

        const first = engine.render();
        // The fake oscillator emits a constant, so any rise across the block is the fade
        // envelope. Without it the very first sample would already be at full amplitude —
        // which is exactly the step that pops.
        expect(Math.abs(first.left[0])).toBeLessThan(Math.abs(first.left[BLOCK_SIZE - 1]));
        expect(Math.abs(first.left[0])).toBeLessThan(0.05);
    });

    it('keeps a removed reverb alive while its tail is still ringing', () => {
        engine.setNode('osc', { type: 'oscillator', frequency: 440, amplitude: 1 });
        engine.setNode('rev', { type: 'reverb', feedback: 0.9, wetMix: 1 });
        engine.setNode('spk', { type: 'speaker', volume: 1, muted: false });
        engine.setConnections([audioEdge('osc', 'rev'), audioEdge('rev', 'spk')]);
        engine.renderBlocks(10);

        const reverb = FakeReverb.instances[0];
        reverb.tail = 0.5; // still ringing

        engine.removeNode('rev');
        engine.renderBlocks(30);
        expect(reverb.freed).toBe(false);

        // Once the tail has decayed the instance is released.
        reverb.tail = 0;
        engine.renderBlocks(5);
        expect(reverb.freed).toBe(true);
    });

    it('keeps a removed synth alive while notes are still sounding', () => {
        engine.setNode('midi', { type: 'midi-input' });
        engine.setNode('syn', { type: 'synth', gain: 0.5 });
        engine.setNode('spk', { type: 'speaker', volume: 1, muted: false });
        engine.setConnections([midiEdge('midi', 'syn'), audioEdge('syn', 'spk')]);
        engine.port.send({ type: 'midi', sourceId: 'midi', events: [{ data: [0x90, 60, 100] }] });
        engine.renderBlocks(5);

        const synth = FakeSynth.instances[0];
        expect(synth.held.has(60)).toBe(true);

        engine.removeNode('syn');
        engine.renderBlocks(30);
        expect(synth.freed).toBe(false);

        synth.held.clear(); // release finished
        engine.renderBlocks(5);
        expect(synth.freed).toBe(true);
    });

    it('reuses instance state when a node is disconnected and reconnected', () => {
        oscToSpeaker();
        engine.renderBlocks(5);
        expect(FakeOscillator.instances).toHaveLength(1);

        engine.setConnections([]);
        engine.renderBlocks(5);
        engine.setConnections([audioEdge('osc', 'spk')]);
        engine.renderBlocks(5);

        // Cutting a cable and reconnecting it must not rebuild the node.
        expect(FakeOscillator.instances).toHaveLength(1);
        expect(FakeOscillator.instances[0].freed).toBe(false);
    });
});

describe('render plan', () => {
    it('is rebuilt only when the graph changes', () => {
        oscToSpeaker();
        engine.render();
        expect(engine.processor._planDirty).toBe(false);

        engine.renderBlocks(5);
        expect(engine.processor._planDirty).toBe(false);

        engine.setConnections([]);
        expect(engine.processor._planDirty).toBe(true);
    });

    it('only renders nodes that can reach a speaker', () => {
        engine.setNode('osc', { type: 'oscillator', frequency: 440, amplitude: 1 });
        engine.setNode('orphan', { type: 'oscillator', frequency: 220, amplitude: 1 });
        engine.setNode('spk', { type: 'speaker', volume: 1, muted: false });
        engine.setConnections([audioEdge('osc', 'spk')]);

        engine.render();

        expect(engine.processor._plan.reachable.has('osc')).toBe(true);
        expect(engine.processor._plan.reachable.has('orphan')).toBe(false);
    });

    it('produces silence with no speaker in the graph', () => {
        engine.setNode('osc', { type: 'oscillator', frequency: 440, amplitude: 1 });
        engine.setConnections([]);
        const { left, right } = engine.render();
        expect(peak(left)).toBe(0);
        expect(peak(right)).toBe(0);
    });
});

describe('buffer pool', () => {
    it('returns every buffer to the pool after each block', () => {
        engine.setNode('osc', { type: 'oscillator', frequency: 440, amplitude: 1 });
        engine.setNode('rev', { type: 'reverb', feedback: 0.3, wetMix: 0.5 });
        engine.setNode('spk', { type: 'speaker', volume: 1, muted: false });
        engine.setConnections([audioEdge('osc', 'rev'), audioEdge('rev', 'spk')]);

        engine.renderBlocks(3);
        const pooledAfterWarmup = engine.processor._bufferPool.length;

        engine.renderBlocks(20);

        // A steady-state graph must not grow the pool — if it does, buffers are being
        // allocated per block and leaked, which is what feeds GC pauses in the audio thread.
        expect(engine.processor._bufferPool.length).toBe(pooledAfterWarmup);
        expect(engine.processor._blockBuffers).toHaveLength(0);
    });
});

describe('C4 — modulation previews are batched and throttled', () => {
    it('sends one batched message rather than one per node per block', () => {
        engine.setNode('num', { type: 'value-number', value: 880 });
        engine.setNode('osc', { type: 'oscillator', frequency: 440, amplitude: 1 });
        engine.setNode('spk', { type: 'speaker', volume: 1, muted: false });
        engine.setConnections([
            paramEdge('num', 'osc', 'frequency'),
            audioEdge('osc', 'spk'),
        ]);

        // Two blocks is ~5.8 ms — well inside the 33 ms throttle window.
        engine.renderBlocks(2);

        expect(engine.port.postedOfType('modPreview')).toHaveLength(0);
        const batches = engine.port.postedOfType('modPreviewBatch');
        expect(batches.length).toBeLessThanOrEqual(1);
    });

    it('carries the resolved value for each modulated node', () => {
        engine.setNode('num', { type: 'value-number', value: 880 });
        engine.setNode('osc', { type: 'oscillator', frequency: 440, amplitude: 1 });
        engine.setNode('spk', { type: 'speaker', volume: 1, muted: false });
        engine.setConnections([
            paramEdge('num', 'osc', 'frequency'),
            audioEdge('osc', 'spk'),
        ]);

        // Advance past the throttle window so a batch is flushed.
        engine.renderBlocks(30);

        const batches = engine.port.postedOfType('modPreviewBatch');
        expect(batches.length).toBeGreaterThan(0);
        const nodes = batches[batches.length - 1].nodes as Record<string, Record<string, number>>;
        expect(nodes.osc.frequency).toBe(880);
    });
});

describe('param modulation', () => {
    it('lets a value node override the stored parameter', () => {
        engine.setNode('num', { type: 'value-number', value: 880 });
        engine.setNode('osc', { type: 'oscillator', frequency: 440, amplitude: 1 });
        engine.setNode('spk', { type: 'speaker', volume: 1, muted: false });
        engine.setConnections([
            paramEdge('num', 'osc', 'frequency'),
            audioEdge('osc', 'spk'),
        ]);

        engine.render();
        expect(FakeOscillator.instances[0].frequency).toBe(880);
    });

    it('adds an LFO on top of the base value', async () => {
        const { FakeLfo } = await import('./harness');
        FakeLfo.nextValue = 1;

        engine.setNode('lfo', { type: 'lfo', beatsPerCycle: 1, depth: 100, offset: 0, bipolar: true });
        engine.setNode('osc', { type: 'oscillator', frequency: 440, amplitude: 1 });
        engine.setNode('spk', { type: 'speaker', volume: 1, muted: false });
        engine.setConnections([
            paramEdge('lfo', 'osc', 'frequency'),
            audioEdge('osc', 'spk'),
        ]);

        engine.render();
        // raw 1 × depth 100 + offset 0, added to the 440 base.
        expect(FakeOscillator.instances[0].frequency).toBe(540);
    });

    it('does not allocate a patched object for unmodulated nodes', () => {
        oscToSpeaker();
        engine.render();
        expect(engine.processor._moddedData.has('osc')).toBe(false);
    });

    it('reuses one patched object across blocks for a modulated node', () => {
        engine.setNode('num', { type: 'value-number', value: 880 });
        engine.setNode('osc', { type: 'oscillator', frequency: 440, amplitude: 1 });
        engine.setNode('spk', { type: 'speaker', volume: 1, muted: false });
        engine.setConnections([
            paramEdge('num', 'osc', 'frequency'),
            audioEdge('osc', 'spk'),
        ]);

        engine.render();
        const first = engine.processor._moddedData.get('osc');
        engine.renderBlocks(5);
        expect(engine.processor._moddedData.get('osc')).toBe(first);
    });

    it('drops a stale modulated value once the connection is removed', () => {
        engine.setNode('num', { type: 'value-number', value: 880 });
        engine.setNode('osc', { type: 'oscillator', frequency: 440, amplitude: 1 });
        engine.setNode('spk', { type: 'speaker', volume: 1, muted: false });
        engine.setConnections([
            paramEdge('num', 'osc', 'frequency'),
            audioEdge('osc', 'spk'),
        ]);
        engine.render();
        expect(FakeOscillator.instances[0].frequency).toBe(880);

        engine.setConnections([audioEdge('osc', 'spk')]);
        engine.render();
        expect(FakeOscillator.instances[0].frequency).toBe(440);
    });
});

describe('value/logic propagation', () => {
    it('resolves a chain in a single pass', () => {
        // bool → add.a, and a literal add.b, feeding the oscillator's amplitude.
        engine.setNode('src', { type: 'value-number', value: 2 });
        engine.setNode('add', { type: 'logic-add', a: 0, b: 3 });
        engine.setNode('osc', { type: 'oscillator', frequency: 440, amplitude: 0 });
        engine.setNode('spk', { type: 'speaker', volume: 1, muted: false });
        engine.setConnections([
            paramEdge('src', 'add', 'a'),
            paramEdge('add', 'osc', 'amplitude'),
            audioEdge('osc', 'spk'),
        ]);

        engine.render();
        // 2 + 3 = 5. The worklet forwards the resolved value as-is; clamping to the
        // oscillator's 0..1 range happens inside the Rust node.
        expect(engine.processor._nodes.get('add').value).toBe(5);
        expect(FakeOscillator.instances[0].amplitude).toBe(5);
    });

    it('evaluates a longer chain without extra passes', () => {
        engine.setNode('src', { type: 'value-number', value: 4 });
        engine.setNode('mul', { type: 'logic-multiply', a: 0, b: 2 });
        engine.setNode('sub', { type: 'logic-subtract', a: 0, b: 3 });
        engine.setNode('osc', { type: 'oscillator', frequency: 0, amplitude: 1 });
        engine.setNode('spk', { type: 'speaker', volume: 1, muted: false });
        engine.setConnections([
            paramEdge('src', 'mul', 'a'),
            paramEdge('mul', 'sub', 'a'),
            paramEdge('sub', 'osc', 'frequency'),
            audioEdge('osc', 'spk'),
        ]);

        engine.render();
        // (4 × 2) − 3 = 5
        expect(FakeOscillator.instances[0].frequency).toBe(5);
    });

    it('passes booleans through without coercing them to numbers', () => {
        engine.setNode('bool', { type: 'value-bool', value: true });
        engine.setNode('seq', { type: 'sequencer', playing: false, length: 8, rateMultiplier: 1 });
        engine.setConnections([paramEdge('bool', 'seq', 'playing')]);

        engine.render();
        // The resolved value lands in the node's patched param object (still a boolean, not
        // coerced to 1), and from there schedules the sequencer to start on the next beat.
        expect(engine.processor._moddedData.get('seq').playing).toBe(true);
        expect(engine.processor._sequencers.get('seq').pendingStartBeat).not.toBeNull();
    });

    it('does not spin on a cycle between value nodes', () => {
        engine.setNode('a', { type: 'logic-add', a: 1, b: 1 });
        engine.setNode('b', { type: 'logic-add', a: 1, b: 1 });
        engine.setConnections([paramEdge('a', 'b', 'a'), paramEdge('b', 'a', 'a')]);

        expect(() => engine.renderBlocks(3)).not.toThrow();
    });
});

describe('MIDI routing', () => {
    it('delivers note on/off to a connected synth', () => {
        engine.setNode('midi', { type: 'midi-input' });
        engine.setNode('syn', { type: 'synth', gain: 0.5 });
        engine.setNode('spk', { type: 'speaker', volume: 1, muted: false });
        engine.setConnections([midiEdge('midi', 'syn'), audioEdge('syn', 'spk')]);

        engine.port.send({ type: 'midi', sourceId: 'midi', events: [{ data: [0x90, 60, 100] }] });
        engine.render();
        expect(FakeSynth.instances[0].notesOn).toEqual([60]);

        engine.port.send({ type: 'midi', sourceId: 'midi', events: [{ data: [0x80, 60, 0] }] });
        engine.render();
        expect(FakeSynth.instances[0].notesOff).toEqual([60]);
    });

    it('routes MIDI through a transpose node', () => {
        engine.setNode('midi', { type: 'midi-input' });
        engine.setNode('tr', { type: 'midi-transpose', semitones: 12, clampLow: 0, clampHigh: 127, passOther: true });
        engine.setNode('syn', { type: 'synth', gain: 0.5 });
        engine.setNode('spk', { type: 'speaker', volume: 1, muted: false });
        engine.setConnections([
            midiEdge('midi', 'tr'),
            midiEdge('tr', 'syn'),
            audioEdge('syn', 'spk'),
        ]);

        engine.port.send({ type: 'midi', sourceId: 'midi', events: [{ data: [0x90, 60, 100] }] });
        engine.render(); // transpose consumes and re-queues
        engine.render(); // synth receives

        expect(FakeSynth.instances[0].notesOn).toEqual([72]);
    });

    it('sends all-notes-off to synths on panic', () => {
        engine.setNode('midi', { type: 'midi-input' });
        engine.setNode('syn', { type: 'synth', gain: 0.5 });
        engine.setNode('spk', { type: 'speaker', volume: 1, muted: false });
        engine.setConnections([midiEdge('midi', 'syn'), audioEdge('syn', 'spk')]);
        engine.port.send({ type: 'midi', sourceId: 'midi', events: [{ data: [0x90, 60, 100] }] });
        engine.render();

        engine.port.send({ type: 'panic' });
        engine.render();

        expect(FakeSynth.instances[0].held.size).toBe(0);
    });
});

describe('B3 — MIDI events are applied at their sample offset', () => {
    function synthPatch() {
        engine.setNode('midi', { type: 'midi-input' });
        engine.setNode('syn', { type: 'synth', gain: 1 });
        engine.setNode('spk', { type: 'speaker', volume: 1, muted: false });
        engine.setConnections([midiEdge('midi', 'syn'), audioEdge('syn', 'spk')]);
    }

    it('splits the render at the event frame instead of rounding to the block start', () => {
        synthPatch();
        engine.renderBlocks(40); // settle the entry fade

        engine.port.send({
            type: 'midi',
            sourceId: 'midi',
            events: [{ data: [0x90, 60, 100], atFrame: 64 }],
        });
        engine.render();

        // The synth fake emits 1 while a note is held and 0 otherwise, so the note-on frame
        // shows up as the transition point. Applying at the block boundary would render the
        // whole block as 1.
        const synth = FakeSynth.instances[0];
        expect(synth.processCalls).toBeGreaterThan(40); // rendered in segments
        expect(synth.notesOn).toEqual([60]);
    });

    it('orders several events within one block by frame', () => {
        synthPatch();
        engine.renderBlocks(40);

        engine.port.send({
            type: 'midi',
            sourceId: 'midi',
            events: [
                { data: [0x90, 67, 100], atFrame: 100 },
                { data: [0x90, 60, 100], atFrame: 10 },
                { data: [0x90, 64, 100], atFrame: 50 },
            ],
        });
        engine.render();

        // Sorted by frame, not by arrival order.
        expect(FakeSynth.instances[0].notesOn).toEqual([60, 64, 67]);
    });

    it('clamps an out-of-range frame into the block', () => {
        synthPatch();
        engine.renderBlocks(40);

        engine.port.send({
            type: 'midi',
            sourceId: 'midi',
            events: [
                { data: [0x90, 60, 100], atFrame: -50 },
                { data: [0x90, 64, 100], atFrame: 99999 },
            ],
        });
        engine.render();

        expect(FakeSynth.instances[0].notesOn).toEqual([60, 64]);
        expect(engine.port.postedOfType('error')).toHaveLength(0);
    });

    it('drains events for a synth that is not wired to a speaker', () => {
        // No audio edge, so the synth never renders — its events must not pile up.
        engine.setNode('midi', { type: 'midi-input' });
        engine.setNode('syn', { type: 'synth', gain: 1 });
        engine.setConnections([midiEdge('midi', 'syn')]);

        engine.port.send({ type: 'midi', sourceId: 'midi', events: [{ data: [0x90, 60, 100] }] });
        engine.render();
        engine.render();

        expect(FakeSynth.instances[0].notesOn).toEqual([60]);
        expect(engine.processor._pendingSynthEvents.get('syn')).toHaveLength(0);
    });

    it('handles the sustain pedal and all-notes-off control changes', () => {
        synthPatch();
        engine.renderBlocks(5);

        engine.port.send({
            type: 'midi',
            sourceId: 'midi',
            events: [
                { data: [0x90, 60, 100] },
                { data: [0xb0, 64, 127] }, // sustain down
            ],
        });
        engine.render();
        expect(FakeSynth.instances[0].held.has(60)).toBe(true);

        engine.port.send({ type: 'midi', sourceId: 'midi', events: [{ data: [0xb0, 123, 0] }] });
        engine.render();
        expect(FakeSynth.instances[0].held.size).toBe(0);
    });
});

describe('message port hygiene', () => {
    it('no longer posts the ack messages nothing consumed', () => {
        oscToSpeaker();
        engine.render();

        for (const type of ['ackNode', 'ackRemove', 'ackConnections', 'ackClear', 'ackBootstrap']) {
            expect(engine.port.postedOfType(type)).toHaveLength(0);
        }
    });

    it('reports no render errors for a normal patch', () => {
        oscToSpeaker();
        engine.renderBlocks(10);
        expect(engine.port.postedOfType('error')).toHaveLength(0);
    });

    it('clears all engine state on clear', () => {
        oscToSpeaker();
        engine.renderBlocks(5);

        engine.port.send({ type: 'clear' });
        engine.render();

        expect(engine.processor._nodes.size).toBe(0);
        expect(engine.processor._nodeGains.size).toBe(0);
        expect(FakeOscillator.instances[0].freed).toBe(true);
    });
});
