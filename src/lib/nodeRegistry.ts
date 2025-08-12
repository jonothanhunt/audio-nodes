import { Volume2, Waves, Speaker, Music } from "lucide-react";
import type { ReactElement } from "react";

export type NodeCategory = "Synthesis" | "Effects" | "Sequencing" | "Utility";

// Category level visual & semantic config (single color now: accentColor)
export interface CategoryDefinition {
    accentColor: string; // single canonical color per category
    kind: "audio" | "midi" | "effect" | "utility" | "other";
}

export const CATEGORY_DEFINITIONS: Record<NodeCategory, CategoryDefinition> = {
    Synthesis: { accentColor: "#8b5cf6", kind: "audio" }, // purple
    Effects: { accentColor: "#3b82f6", kind: "effect" }, // blue
    Sequencing: { accentColor: "#f59e0b", kind: "midi" }, // amber
    Utility: { accentColor: "#10b981", kind: "utility" }, // green
};

export interface NodeDefinition {
    type: string;
    name: string;
    description: string;
    category: NodeCategory;
    tag: string; // short label
    icon: (props: { className?: string }) => ReactElement;
}

export const NODE_DEFINITIONS: NodeDefinition[] = [
    {
        type: "oscillator",
        name: "Oscillator",
        description: "Basic waveform generator",
        category: "Synthesis",
        tag: "synthesis",
        icon: Volume2 as unknown as NodeDefinition["icon"],
    },
    {
        type: "synth",
        name: "Synth",
        description: "Poly synth (MIDI in → audio out)",
        category: "Synthesis",
        tag: "synthesis",
        icon: Volume2 as unknown as NodeDefinition["icon"],
    },
    {
        type: "reverb",
        name: "Reverb",
        description: "Spatial reverberation",
        category: "Effects",
        tag: "effect",
        icon: Waves as unknown as NodeDefinition["icon"],
    },
    {
        type: "sequencer",
        name: "Sequencer",
        description: "Step sequencer (MIDI out)",
        category: "Sequencing",
        tag: "midi",
        icon: Music as unknown as NodeDefinition["icon"],
    },
    {
        type: "midi-input",
        name: "MIDI In",
        description: "Hardware MIDI input",
        category: "Sequencing",
        tag: "midi",
        icon: Music as unknown as NodeDefinition["icon"],
    },
    {
        type: "midi-transpose",
        name: "MIDI Transpose",
        description: "Shift note pitch ± semitones",
        category: "Sequencing",
        tag: "midi",
        icon: Music as unknown as NodeDefinition["icon"],
    },
    {
        type: "speaker",
        name: "Speaker",
        description: "Audio output",
        category: "Utility",
        tag: "utility",
        icon: Speaker as unknown as NodeDefinition["icon"],
    },
];

export function getNodeDefinition(type?: string) {
    return NODE_DEFINITIONS.find((d) => d.type === type);
}

export interface UnifiedNodeMeta {
    type: string;
    category: NodeCategory;
    accentColor: string; // single color
    kind: CategoryDefinition["kind"];
    // Backwards compatibility alias (deprecated): base & accent map to accentColor
    base?: string;
    accent?: string;
}

export function getNodeMeta(type?: string): UnifiedNodeMeta {
    const def = getNodeDefinition(type);
    if (!def || !type) {
        return {
            type: type || "unknown",
            category: "Utility",
            accentColor: "#64748b",
            kind: "other",
            base: "#64748b",
            accent: "#64748b",
        };
    }
    const cat = CATEGORY_DEFINITIONS[def.category];
    return {
        type: def.type,
        category: def.category,
        accentColor: cat.accentColor,
        kind: cat.kind,
        base: cat.accentColor,
        accent: cat.accentColor,
    };
}

export function groupDefinitionsByCategory() {
    const map: Record<NodeCategory, NodeDefinition[]> = {
        Synthesis: [],
        Effects: [],
        Sequencing: [],
        Utility: [],
    };
    for (const def of NODE_DEFINITIONS) {
        map[def.category].push(def);
    }
    return map;
}

export function getCategoryTone(category: NodeCategory) {
    switch (category) {
        case "Synthesis":
            return "purple";
        case "Effects":
            return "blue";
        case "Sequencing":
            return "amber";
        case "Utility":
            return "green";
        default:
            return "slate";
    }
}
