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
            if (handleId === "volume") return "param-in";
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
            // Backward compat: original implementation used id "midi" for both; now we split.
            if (handleId === "midi") return "midi-in";
            if (handleId === "midi-out") return "midi-out";
            return "unknown";
        case "value-bool":
            if (handleId === "output" || handleId == null) return "param-out";
            if (handleId === "value") return "param-in"; // allow overriding via link too
            return "unknown";
        case "value-number":
            if (handleId === "output" || handleId == null) return "param-out";
            if (["value", "min", "max", "step", "ranged"].includes(handleId || ""))
                return "param-in";
            return "unknown";
        case "value-string":
            if (handleId === "output" || handleId == null) return "param-out";
            if (handleId === "value") return "param-in";
            return "unknown";
        case "value-text":
            if (handleId === "output" || handleId == null) return "param-out";
            if (handleId === "value") return "param-in";
            return "unknown";
        case "value-select":
            if (handleId === "output" || handleId == null) return "param-out";
            if (handleId === "value" || handleId === "options") return "param-in";
            return "unknown";
        default:
            return "unknown";
    }
}
