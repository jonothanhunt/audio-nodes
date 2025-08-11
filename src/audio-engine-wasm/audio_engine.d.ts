/* tslint:disable */
/* eslint-disable */
export class AudioEngine {
  free(): void;
  constructor(sample_rate: number);
  process_audio(output: Float32Array): void;
  readonly sample_rate: number;
  readonly buffer_size: number;
}
export class MidiTransposeNode {
  free(): void;
  constructor();
  set_params(semitones: number, clamp_low: number, clamp_high: number, pass_through_non_note: boolean): void;
  transform(status: number, data1: number, data2: number): Uint8Array;
}
export class OscillatorNode {
  free(): void;
  constructor(sample_rate: number);
  set_waveform(waveform: number): void;
  process(output: Float32Array): void;
  frequency: number;
  amplitude: number;
}
export class ReverbNode {
  free(): void;
  constructor(sample_rate: number);
  process(input: Float32Array, output: Float32Array): void;
  feedback: number;
  wet_mix: number;
}
export class SpeakerNode {
  free(): void;
  constructor();
  process(input: Float32Array, output: Float32Array): void;
  volume: number;
  muted: boolean;
}
export class SynthNode {
  free(): void;
  constructor(sample_rate: number);
  note_on(note: number, velocity: number): void;
  note_off(note: number): void;
  sustain_pedal(down: boolean): void;
  set_waveform(waveform: number): void;
  set_adsr(attack: number, decay: number, sustain: number, release: number): void;
  set_glide(time_ms: number): void;
  set_gain(gain: number): void;
  set_max_voices(max: number): void;
  process(output: Float32Array): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_reverbnode_free: (a: number, b: number) => void;
  readonly reverbnode_new: (a: number) => number;
  readonly reverbnode_set_feedback: (a: number, b: number) => void;
  readonly reverbnode_feedback: (a: number) => number;
  readonly reverbnode_set_wet_mix: (a: number, b: number) => void;
  readonly reverbnode_wet_mix: (a: number) => number;
  readonly reverbnode_process: (a: number, b: number, c: number, d: number, e: number, f: any) => void;
  readonly __wbg_synthnode_free: (a: number, b: number) => void;
  readonly synthnode_new: (a: number) => number;
  readonly synthnode_note_on: (a: number, b: number, c: number) => void;
  readonly synthnode_note_off: (a: number, b: number) => void;
  readonly synthnode_sustain_pedal: (a: number, b: number) => void;
  readonly synthnode_set_waveform: (a: number, b: number) => void;
  readonly synthnode_set_adsr: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly synthnode_set_glide: (a: number, b: number) => void;
  readonly synthnode_set_gain: (a: number, b: number) => void;
  readonly synthnode_set_max_voices: (a: number, b: number) => void;
  readonly synthnode_process: (a: number, b: number, c: number, d: any) => void;
  readonly __wbg_miditransposenode_free: (a: number, b: number) => void;
  readonly miditransposenode_new: () => number;
  readonly miditransposenode_set_params: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly miditransposenode_transform: (a: number, b: number, c: number, d: number) => [number, number];
  readonly __wbg_audioengine_free: (a: number, b: number) => void;
  readonly audioengine_new: (a: number) => number;
  readonly audioengine_sample_rate: (a: number) => number;
  readonly audioengine_buffer_size: (a: number) => number;
  readonly audioengine_process_audio: (a: number, b: number, c: number, d: any) => void;
  readonly __wbg_oscillatornode_free: (a: number, b: number) => void;
  readonly oscillatornode_new: (a: number) => number;
  readonly oscillatornode_set_frequency: (a: number, b: number) => void;
  readonly oscillatornode_frequency: (a: number) => number;
  readonly oscillatornode_set_amplitude: (a: number, b: number) => void;
  readonly oscillatornode_amplitude: (a: number) => number;
  readonly oscillatornode_set_waveform: (a: number, b: number) => void;
  readonly oscillatornode_process: (a: number, b: number, c: number, d: any) => void;
  readonly __wbg_speakernode_free: (a: number, b: number) => void;
  readonly speakernode_new: () => number;
  readonly speakernode_set_volume: (a: number, b: number) => void;
  readonly speakernode_set_muted: (a: number, b: number) => void;
  readonly speakernode_muted: (a: number) => number;
  readonly speakernode_process: (a: number, b: number, c: number, d: number, e: number, f: any) => void;
  readonly speakernode_volume: (a: number) => number;
  readonly __wbindgen_export_0: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
