/**
 * Test harness for the real AudioWorkletProcessor.
 *
 * The processor is written against worklet globals (`AudioWorkletProcessor`, `sampleRate`,
 * `registerProcessor`) and calls `registerProcessor` at module scope, so it cannot simply be
 * imported. This installs stand-ins for those globals, loads the *compiled* worklet from
 * `public/worklets/`, and hands back the registered class plus fake WASM node constructors.
 *
 * Testing the compiled artefact rather than a hand-copied excerpt means these specs
 * exercise the code that actually ships.
 */

export const SAMPLE_RATE = 44100;
export const BLOCK_SIZE = 128;

export interface PostedMessage {
    type?: string;
    [key: string]: unknown;
}

/** A fake port that records what the processor posts and lets tests inject messages. */
export class FakePort {
    posted: PostedMessage[] = [];
    onmessage: ((e: { data: unknown }) => void) | null = null;
    private listeners: Array<(e: { data: unknown }) => void> = [];

    postMessage(msg: PostedMessage): void {
        this.posted.push(msg);
    }

    addEventListener(_type: string, cb: (e: { data: unknown }) => void): void {
        this.listeners.push(cb);
    }

    /** Deliver a message to the processor as if it came from the main thread. */
    send(data: unknown): void {
        this.onmessage?.({ data });
        for (const cb of this.listeners) cb({ data });
    }

    postedOfType(type: string): PostedMessage[] {
        return this.posted.filter((m) => m.type === type);
    }
}

// ---------------------------------------------------------------------------
// Fake WASM nodes
// ---------------------------------------------------------------------------

/**
 * Oscillator stand-in.
 *
 * `counter` stands in for the node's phase — it advances by one per sample rendered, so if
 * the render path calls `process()` twice in one quantum the counter moves twice as far.
 * That is the instrument for the fan-out regression, where a node feeding two destinations
 * had its phase double-advanced and came out an octave high.
 *
 * The *output* is deliberately a bounded constant rather than the counter, so gain and fade
 * assertions measure the gain envelope instead of a runaway ramp.
 */
export class FakeOscillator {
    static instances: FakeOscillator[] = [];
    frequency = 440;
    amplitude = 0.5;
    waveform = 0;
    processCalls = 0;
    counter = 0;
    freed = false;

    constructor(public readonly sampleRate: number) {
        FakeOscillator.instances.push(this);
    }

    set_waveform(w: number): void {
        this.waveform = w;
    }

    process(output: Float32Array): void {
        this.processCalls++;
        this.counter += output.length;
        output.fill(1);
    }

    free(): void {
        this.freed = true;
    }
}

/** Reverb stand-in: passes input through and reports a configurable tail. */
export class FakeReverb {
    static instances: FakeReverb[] = [];
    feedback = 0.3;
    wet_mix = 0.3;
    processCalls = 0;
    lastInput: number[] = [];
    tail = 0;
    freed = false;

    constructor(public readonly sampleRate: number) {
        FakeReverb.instances.push(this);
    }

    tail_peak(): number {
        return this.tail;
    }

    process(input: Float32Array, output: Float32Array): void {
        this.processCalls++;
        this.lastInput = Array.from(input);
        for (let i = 0; i < output.length; i++) output[i] = input[i];
    }

    free(): void {
        this.freed = true;
    }
}

/** Synth stand-in that records MIDI calls and emits a constant when notes are held. */
export class FakeSynth {
    static instances: FakeSynth[] = [];
    notesOn: number[] = [];
    notesOff: number[] = [];
    held = new Set<number>();
    adsr: number[] | null = null;
    gain = 0.5;
    processCalls = 0;
    freed = false;

    constructor(public readonly sampleRate: number) {
        FakeSynth.instances.push(this);
    }

    note_on(note: number, _velocity: number): void {
        this.notesOn.push(note);
        this.held.add(note);
    }
    note_off(note: number): void {
        this.notesOff.push(note);
        this.held.delete(note);
    }
    sustain_pedal(_down: boolean): void { }
    set_waveform(_w: number): void { }
    set_adsr(a: number, d: number, s: number, r: number): void {
        this.adsr = [a, d, s, r];
    }
    set_glide(_ms: number): void { }
    set_gain(g: number): void {
        this.gain = g;
    }
    set_max_voices(_n: number): void { }
    is_active(): boolean {
        return this.held.size > 0;
    }
    process(output: Float32Array): void {
        this.processCalls++;
        const v = this.held.size > 0 ? 1 : 0;
        output.fill(v);
    }
    free(): void {
        this.freed = true;
    }
}

/** LFO stand-in returning a value the test controls. */
export class FakeLfo {
    static nextValue = 0;
    static instances: FakeLfo[] = [];
    beatsPerCycle = 1;
    waveform = 0;
    phaseOffset = 0;

    constructor(public readonly sampleRate: number) {
        FakeLfo.instances.push(this);
    }

    set_params(beats: number, waveform: number, phase: number): void {
        this.beatsPerCycle = beats;
        this.waveform = waveform;
        this.phaseOffset = phase;
    }

    next_value(_blockSamples: number, _bpm: number): number {
        return FakeLfo.nextValue;
    }

    free(): void { }
}

/** Transpose stand-in that shifts note numbers by a fixed amount. */
export class FakeTranspose {
    semitones = 0;
    passOther = true;

    set_params(semitones: number, _low: number, _high: number, passOther: boolean): void {
        this.semitones = semitones;
        this.passOther = passOther;
    }

    transform(status: number, data1: number, data2: number): number[] {
        const cmd = status & 0xf0;
        if (cmd === 0x90 || cmd === 0x80) {
            return [status, Math.max(0, Math.min(127, data1 + this.semitones)), data2];
        }
        return this.passOther ? [status, data1, data2] : [];
    }

    free(): void { }
}

export function resetFakes(): void {
    FakeOscillator.instances = [];
    FakeReverb.instances = [];
    FakeSynth.instances = [];
    FakeLfo.instances = [];
    FakeLfo.nextValue = 0;
}

// ---------------------------------------------------------------------------
// Loading the compiled worklet
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

let cachedProcessorClass: any = null;

/**
 * Load the compiled worklet once and return the class passed to `registerProcessor`.
 *
 * The compiled bundle is produced by `npm run build:worklet`, which the `test` script runs
 * first so the artefact is always current.
 */
export async function loadProcessorClass(): Promise<any> {
    if (cachedProcessorClass) return cachedProcessorClass;

    const g = globalThis as any;
    g.sampleRate = SAMPLE_RATE;
    g.currentTime = 0;
    g.currentFrame = 0;
    g.AudioWorkletProcessor = class {
        port = new FakePort();
    };
    g.registerProcessor = (_name: string, ctor: any) => {
        cachedProcessorClass = ctor;
    };

    // Resolved at runtime rather than as a static specifier: the compiled worklet is a
    // non-module script that declares the same top-level names as its TypeScript source, so
    // letting the compiler pull it into the program produces duplicate-identifier errors.
    const workletUrl = new URL(
        '../../../public/worklets/audio-engine-processor.js',
        import.meta.url,
    ).href;
    await import(/* @vite-ignore */ workletUrl);
    if (!cachedProcessorClass) {
        throw new Error('worklet did not call registerProcessor — run `npm run build:worklet`');
    }
    return cachedProcessorClass;
}

export interface Engine {
    processor: any;
    port: FakePort;
    /** Render one quantum and return the stereo output buffers. */
    render(): { left: Float32Array; right: Float32Array };
    /** Render `n` quanta, returning the final block. */
    renderBlocks(n: number): { left: Float32Array; right: Float32Array };
    setNode(nodeId: string, data: Record<string, unknown>): void;
    removeNode(nodeId: string): void;
    setConnections(
        connections: Array<{ from: string; to: string; fromOutput: string | null; toInput: string | null }>,
    ): void;
}

/**
 * Build a processor with the WASM layer replaced by the fakes above and the bootstrap
 * already marked complete.
 */
export async function createEngine(): Promise<Engine> {
    const Ctor = await loadProcessorClass();
    resetFakes();

    const processor = new Ctor();
    const port: FakePort = processor.port;

    processor._wasm = {
        OscillatorNode: FakeOscillator,
        ReverbNode: FakeReverb,
        SynthNode: FakeSynth,
        LfoNode: FakeLfo,
        MidiTransposeNode: FakeTranspose,
    };
    processor._ready = true;
    processor._loading = false;

    const left = new Float32Array(BLOCK_SIZE);
    const right = new Float32Array(BLOCK_SIZE);
    const outputs = [[left, right]];

    const render = () => {
        processor.process([], outputs);
        return { left, right };
    };

    return {
        processor,
        port,
        render,
        renderBlocks(n: number) {
            let last = { left, right };
            for (let i = 0; i < n; i++) last = render();
            return last;
        },
        setNode(nodeId, data) {
            port.send({ type: 'updateNode', nodeId, data });
        },
        removeNode(nodeId) {
            port.send({ type: 'removeNode', nodeId });
        },
        setConnections(connections) {
            port.send({ type: 'updateConnections', connections });
        },
    };
}

/** Convenience: an audio edge from `from`'s output into `to`'s main input. */
export function audioEdge(from: string, to: string) {
    return { from, to, fromOutput: 'output', toInput: 'input' };
}

/** Convenience: a MIDI edge. */
export function midiEdge(from: string, to: string) {
    return { from, to, fromOutput: 'midi-out', toInput: 'midi' };
}

/** Convenience: a param-modulation edge onto `param`. */
export function paramEdge(from: string, to: string, param: string) {
    return { from, to, fromOutput: 'param-out', toInput: param };
}

/** Peak absolute sample in a buffer. */
export function peak(buf: Float32Array): number {
    let max = 0;
    for (const s of buf) max = Math.max(max, Math.abs(s));
    return max;
}
