/**
 * Type declarations for the Rust/wasm-bindgen audio engine nodes.
 *
 * These mirror the `#[wasm_bindgen]` exports in core-audio/wasm/src/nodes/*.rs.
 * If you add/change a wasm_bindgen method in Rust, update this file to match.
 */

/** Frees the WASM-allocated memory backing this instance. */
interface WasmFreeable {
    free?(): void;
}

// ---------------------------------------------------------------------------
// OscillatorNode
// ---------------------------------------------------------------------------
interface WasmOscillatorNode extends WasmFreeable {
    frequency: number;
    amplitude: number;
    set_waveform(waveform: number): void;
    process(output: Float32Array): void;
}

interface WasmOscillatorNodeConstructor {
    new(sampleRate: number): WasmOscillatorNode;
}

// ---------------------------------------------------------------------------
// ReverbNode
// ---------------------------------------------------------------------------
interface WasmReverbNode extends WasmFreeable {
    feedback: number;
    wet_mix: number;
    /** Peak still circulating in the delay line — lets the worklet wait out a tail. */
    tail_peak?(): number;
    process(input: Float32Array, output: Float32Array): void;
}

interface WasmReverbNodeConstructor {
    new(sampleRate: number): WasmReverbNode;
}

// ---------------------------------------------------------------------------
// SynthNode
// ---------------------------------------------------------------------------
interface WasmSynthNode extends WasmFreeable {
    note_on(note: number, velocity: number): void;
    note_off(note: number): void;
    all_notes_off?(): void;
    sustain_pedal(down: boolean): void;
    set_waveform(waveform: number): void;
    set_adsr(attack: number, decay: number, sustain: number, release: number): void;
    set_glide(timeMs: number): void;
    set_gain(gain: number): void;
    set_max_voices(max: number): void;
    /** True while any voice is still sounding — lets the worklet wait out a release. */
    is_active?(): boolean;
    process(output: Float32Array): void;
}

interface WasmSynthNodeConstructor {
    new(sampleRate: number): WasmSynthNode;
}

// ---------------------------------------------------------------------------
// LfoNode
// ---------------------------------------------------------------------------
interface WasmLfoNode extends WasmFreeable {
    set_params(beatsPerCycle: number, waveformIndex: number, phaseOffset: number): void;
    next_value(blockSamples: number, bpm: number): number;
}

interface WasmLfoNodeConstructor {
    new(sampleRate: number): WasmLfoNode;
}

// ---------------------------------------------------------------------------
// MidiTransposeNode
// ---------------------------------------------------------------------------
interface WasmMidiTransposeNode extends WasmFreeable {
    set_params(semitones: number, clampLow: number, clampHigh: number, passOther: boolean): void;
    transform(status: number, data1: number, data2: number): Uint8Array | number[];
}

interface WasmMidiTransposeNodeConstructor {
    new(): WasmMidiTransposeNode;
}

// ---------------------------------------------------------------------------
// Aggregated WASM module namespace
// ---------------------------------------------------------------------------
interface WasmEngineModule {
    OscillatorNode: WasmOscillatorNodeConstructor;
    ReverbNode: WasmReverbNodeConstructor;
    SynthNode: WasmSynthNodeConstructor;
    MidiTransposeNode: WasmMidiTransposeNodeConstructor;
    LfoNode: WasmLfoNodeConstructor;
}
