export interface AudioNodeData {
    type: string;
    frequency?: number;
    amplitude?: number;
    waveform?: string;
    feedback?: number;
    wetMix?: number;
    volume?: number;
    muted?: boolean;
    // Synth params
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
}
