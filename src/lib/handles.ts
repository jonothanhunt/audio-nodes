// Map handle ids to semantic roles so we can validate connections
export type HandleRole =
    | "audio-in"
    | "audio-out"
    | "param-in"
    | "param-out"
    | "midi-out"
    | "midi-in"
    | "unknown";

export function getHandleRole(
    nodeType: string | undefined,
    handleId: string | undefined,
): HandleRole {
    switch (nodeType) {
        case "oscillator":
            if (handleId === "output") return "audio-out";
            if (handleId === "frequency" || handleId === "amplitude")
                return "param-in";
            return "unknown";
        case "reverb":
            if (handleId === "input") return "audio-in";
            if (handleId === "output") return "audio-out";
            if (handleId === "feedback" || handleId === "wetMix")
                return "param-in";
            return "unknown";
        case "speaker":
            if (handleId === "input") return "audio-in";
            if (handleId === "volume" || handleId === "muted") return "param-in"; // allow external modulation of volume & mute toggle
            return "unknown";
        case "sequencer":
            if (handleId === "midi-out" || handleId === "midi")
                return "midi-out";
            if (
                ["fromNote", "toNote", "length", "playing", "bpm"].includes(
                    handleId || "",
                )
            )
                return "param-in";
            return "unknown";
        case "synth":
            if (handleId === "midi") return "midi-in";
            if (handleId === "output") return "audio-out";
            if (
                [
                    "preset",
                    "waveform",
                    "attack",
                    "decay",
                    "sustain",
                    "release",
                    "cutoff",
                    "resonance",
                    "glide",
                    "gain",
                    "maxVoices",
                ].includes(handleId || "")
            )
                return "param-in";
            return "unknown";
        case "midi-input":
            if (handleId === "midi") return "midi-out"; // expose hardware MIDI as source
            return "unknown";
        case "midi-transpose":
            if (handleId === "midi" || handleId === "midi-in") return "midi-in";
            if (handleId === "midi-out") return "midi-out";
            if (["semitones", "clampLow", "clampHigh", "passOther"].includes(handleId || "")) return "param-in";
            return "unknown";
        case "arpeggiator":
            if (handleId === "midi-in" || handleId === "midi") return "midi-in";
            if (handleId === "midi-out") return "midi-out";
            if (["playing", "rateMultiplier", "mode", "octaves"].includes(handleId || "")) return "param-in";
            return "unknown";
        case "value-bool":
            if (handleId === "param-out" || handleId == null) return "param-out";
            if (handleId === "value") return "param-in";
            return "unknown";
        case "value-number":
            if (handleId === "output" || handleId == null) return "param-out";
            if (["value", "min", "max", "step", "ranged"].includes(handleId || ""))
                return "param-in";
            return "unknown";

        case "value-text":
            if (handleId === "output" || handleId == null) return "param-out";
            if (handleId === "value") return "param-in";
            return "unknown";
        case "value-select":
            if (handleId === "output" || handleId == null) return "param-out";
            if (handleId === "value" || handleId === "options") return "param-in";
            return "unknown";
        case "lfo":
            // Expose a param-out for modulation value and param-ins for its own params if needed
            if (handleId === "output" || handleId == null) return "param-out";
            if (["waveform", "beatsPerCycle", "depth", "offset", "bipolar", "phase"].includes(handleId || "")) return "param-in";
            return "unknown";
        default:
            return "unknown";
    }
}
