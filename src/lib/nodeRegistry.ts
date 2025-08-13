import { Volume2, Waves, Speaker, Music, ToggleRight, Hash, List } from "lucide-react";
import type { ReactElement } from "react";

export type NodeCategory = "Synthesis" | "Effects" | "Sequencing" | "Utility" | "Value";

// Category level visual & semantic config (single color now: accentColor)
export interface CategoryDefinition {
    accentColor: string; // single canonical color per category
    kind: "audio" | "midi" | "effect" | "utility" | "value";
}

export const CATEGORY_DEFINITIONS: Record<NodeCategory, CategoryDefinition> = {
    Synthesis: { accentColor: "#8b5cf6", kind: "audio" }, // purple
    Effects: { accentColor: "#3b82f6", kind: "effect" }, // blue
    Sequencing: { accentColor: "#f59e0b", kind: "midi" }, // amber
    Utility: { accentColor: "#10b981", kind: "utility" }, // green
    Value: { accentColor: "#ef4444", kind: "value" }, // red accent
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
    // Value category
    {
        type: "value-bool",
        name: "Bool",
        description: "Boolean value source (on/off)",
        category: "Value",
        tag: "value",
        icon: ToggleRight as unknown as NodeDefinition["icon"],
    },
    {
        type: "value-number",
        name: "Number",
        description: "Number value source (with optional range)",
        category: "Value",
        tag: "value",
        icon: Hash as unknown as NodeDefinition["icon"],
    },
    {
        type: "value-text",
        name: "Text",
        description: "Free text value source",
        category: "Value",
        tag: "value",
        icon: List as unknown as NodeDefinition["icon"],
    },
    {
        type: "value-select",
        name: "Select",
        description: "Dropdown enum value source",
        category: "Value",
        tag: "value",
        icon: List as unknown as NodeDefinition["icon"],
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
    // Alias legacy types to preserve category tone and kind
    const aliasType = type === "value-string" ? "value-text" : type;
    const def = getNodeDefinition(aliasType);
    if (!def || !type) {
        return {
            type: aliasType || "unknown",
            category: "Utility",
            accentColor: "#64748b",
            kind: "utility",
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
        Value: [],
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
        case "Value":
            return "red"; // red tone for Value nodes
        default:
            return "slate";
    }
}
