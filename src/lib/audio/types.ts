export interface AudioNodeData {
    type: string;
    // Oscillator
    frequency?: number;
    amplitude?: number;
    waveform?: string;
    // Reverb
    feedback?: number;
    wetMix?: number;
    // Speaker
    volume?: number;
    muted?: boolean;
    // Synth
    preset?: string;
    attack?: number;
    decay?: number;
    sustain?: number;
    release?: number;
    cutoff?: number;
    resonance?: number;
    glide?: number;
    gain?: number;
    maxVoices?: number;
    // Sequencer / Arpeggiator
    playing?: boolean;
    rateMultiplier?: number;
    length?: number;
    fromNote?: string;
    toNote?: string;
    steps?: boolean[][];
    mode?: string;
    octaves?: number;
    // Value nodes
    value?: boolean | number | string;
    // LFO
    beatsPerCycle?: number;
    depth?: number;
    offset?: number;
    bipolar?: boolean;
    phase?: number;
    // MIDI Transpose
    semitones?: number;
    clampLow?: number;
    clampHigh?: number;
    passOther?: boolean;
    // Catch-all for future/unknown params (preserves forward compatibility)
    [key: string]: unknown;
}
