// Helpers for node defaults and registry

export function getDefaultNodeData(
    type: string,
    onParameterChange: (
        nodeId: string,
        parameter: string,
        value: string | number | boolean,
    ) => void,
    onEmitMidi?: (
        sourceId: string,
        events: Array<{
            data: [number, number, number];
            atFrame?: number;
            atTimeMs?: number;
        }>,
    ) => void,
) {
    switch (type) {
        case "oscillator":
            return {
                frequency: 440,
                amplitude: 0.5,
                waveform: "sine",
                onParameterChange,
            };
        case "reverb":
            return { feedback: 0.3, wetMix: 0.3, onParameterChange };
        case "speaker":
            return { volume: 0.8, muted: false, onParameterChange };
        case "sequencer":
            return {
                length: 16,
                fromNote: "C4",
                toNote: "C5",
                rateMultiplier: 1,
                playing: false,
                onParameterChange,
                onEmitMidi,
            };
        case "synth":
            return {
                preset: "Init",
                waveform: "sawtooth",
                attack: 0.005,
                decay: 0.12,
                sustain: 0.7,
                release: 0.12,
                cutoff: 10000,
                resonance: 0.2,
                glide: 0,
                gain: 0.5,
                maxVoices: 8,
                onParameterChange,
            };
        case "midi-input":
            return {
                deviceId: "",
                channel: "all",
                status: "idle",
                devices: [],
                onParameterChange,
                onEmitMidi,
            };
        case "midi-transpose":
            return {
                semitones: 0,
                clampLow: 0,
                clampHigh: 127,
                passOther: true,
                onParameterChange,
            };
        case "value-bool":
            return { value: false, onParameterChange };
        case "value-number":
            return {
                value: 0,
                ranged: false,
                min: 0,
                max: 100,
                step: 1,
                onParameterChange,
            };
        case "value-string":
            return { value: "", onParameterChange };
        case "value-text":
            return { value: "", onParameterChange };
        case "value-select":
            return { value: "", options: "", onParameterChange };
        default:
            return { onParameterChange };
    }
}
