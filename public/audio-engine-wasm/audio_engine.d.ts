/* tslint:disable */
/* eslint-disable */

export class LfoNode {
    free(): void;
    [Symbol.dispose](): void;
    constructor(sample_rate: number);
    next_value(block_samples: number, bpm: number): number;
    set_params(beats_per_cycle: number, waveform_index: number, phase_offset: number): void;
}

export class MidiTransposeNode {
    free(): void;
    [Symbol.dispose](): void;
    constructor();
    set_params(semitones: number, clamp_low: number, clamp_high: number, pass_through_non_note: boolean): void;
    transform(status: number, data1: number, data2: number): Uint8Array;
}

export class OscillatorNode {
    free(): void;
    [Symbol.dispose](): void;
    constructor(sample_rate: number);
    process(output: Float32Array): void;
    set_waveform(waveform: number): void;
    amplitude: number;
    frequency: number;
}

export class ReverbNode {
    free(): void;
    [Symbol.dispose](): void;
    constructor(sample_rate: number);
    process(input: Float32Array, output: Float32Array): void;
    /**
     * Peak absolute value still circulating in the delay line. The worklet uses this to
     * decide when a disconnected reverb has finished ringing and can be dropped, so a
     * tail decays naturally instead of being cut off mid-air.
     */
    tail_peak(): number;
    feedback: number;
    wet_mix: number;
}

export class SynthNode {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * True while any voice is still producing signal. The worklet uses this to know when
     * a synth has gone quiet, so a removed node's release tail can ring out before the
     * instance is dropped.
     */
    is_active(): boolean;
    constructor(sample_rate: number);
    note_off(note: number): void;
    note_on(note: number, velocity: number): void;
    process(output: Float32Array): void;
    set_adsr(attack: number, decay: number, sustain: number, release: number): void;
    set_gain(gain: number): void;
    set_glide(time_ms: number): void;
    set_max_voices(max: number): void;
    set_waveform(waveform: number): void;
    sustain_pedal(down: boolean): void;
}

export enum Waveform {
    Sine = 0,
    Square = 1,
    Sawtooth = 2,
    Triangle = 3,
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_lfonode_free: (a: number, b: number) => void;
    readonly __wbg_miditransposenode_free: (a: number, b: number) => void;
    readonly __wbg_oscillatornode_free: (a: number, b: number) => void;
    readonly __wbg_reverbnode_free: (a: number, b: number) => void;
    readonly __wbg_synthnode_free: (a: number, b: number) => void;
    readonly lfonode_new: (a: number) => number;
    readonly lfonode_next_value: (a: number, b: number, c: number) => number;
    readonly lfonode_set_params: (a: number, b: number, c: number, d: number) => void;
    readonly miditransposenode_new: () => number;
    readonly miditransposenode_set_params: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly miditransposenode_transform: (a: number, b: number, c: number, d: number) => [number, number];
    readonly oscillatornode_amplitude: (a: number) => number;
    readonly oscillatornode_frequency: (a: number) => number;
    readonly oscillatornode_new: (a: number) => number;
    readonly oscillatornode_process: (a: number, b: number, c: number, d: any) => void;
    readonly oscillatornode_set_amplitude: (a: number, b: number) => void;
    readonly oscillatornode_set_frequency: (a: number, b: number) => void;
    readonly oscillatornode_set_waveform: (a: number, b: number) => void;
    readonly reverbnode_feedback: (a: number) => number;
    readonly reverbnode_new: (a: number) => number;
    readonly reverbnode_process: (a: number, b: number, c: number, d: number, e: number, f: any) => void;
    readonly reverbnode_set_feedback: (a: number, b: number) => void;
    readonly reverbnode_set_wet_mix: (a: number, b: number) => void;
    readonly reverbnode_tail_peak: (a: number) => number;
    readonly reverbnode_wet_mix: (a: number) => number;
    readonly synthnode_is_active: (a: number) => number;
    readonly synthnode_new: (a: number) => number;
    readonly synthnode_note_off: (a: number, b: number) => void;
    readonly synthnode_note_on: (a: number, b: number, c: number) => void;
    readonly synthnode_process: (a: number, b: number, c: number, d: any) => void;
    readonly synthnode_set_adsr: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly synthnode_set_gain: (a: number, b: number) => void;
    readonly synthnode_set_glide: (a: number, b: number) => void;
    readonly synthnode_set_max_voices: (a: number, b: number) => void;
    readonly synthnode_set_waveform: (a: number, b: number) => void;
    readonly synthnode_sustain_pedal: (a: number, b: number) => void;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
