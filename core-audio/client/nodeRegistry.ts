import { Waves, Sparkles, Speaker, Music, ToggleRight, Hash, List, Camera, Cpu } from "lucide-react";

export type NodeCategoryName = "Synthesis" | "Effects" | "Sequencing" | "Utility" | "Value" | "Logic";

export interface NodeEntry {
    type: string;
    name: string;
    description: string;
    tag: string;
    // Use React component type so consumers can pass standard svg props incl. style
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}

export interface CategoryEntry {
    name: NodeCategoryName;
    color: string; // single canonical color per category
    kind: "audio" | "midi" | "effect" | "utility" | "value";
    nodes: NodeEntry[];
}

// Single authoritative registry structure (array of categories each with nodes)
export const NODE_CATEGORIES: CategoryEntry[] = [
    {
        name: "Synthesis",
        color: "#8b5cf6",
        kind: "audio",
        nodes: [
            { type: "oscillator", name: "Oscillator", description: "Basic waveform generator", tag: "synthesis", icon: Waves },
            { type: "synth", name: "Synth", description: "Poly synth (MIDI in → audio out)", tag: "synthesis", icon: Waves },
        ],
    },
    {
        name: "Effects",
        color: "#3b82f6",
        kind: "effect",
        nodes: [
            { type: "reverb", name: "Reverb", description: "Spatial reverberation", tag: "effect", icon: Sparkles },
        ],
    },
    {
        name: "Sequencing",
        color: "#f59e0b",
        kind: "midi",
        nodes: [
            { type: "sequencer", name: "Sequencer", description: "Step sequencer (MIDI out)", tag: "midi", icon: Music },
            { type: "arpeggiator", name: "Arpeggiator", description: "Arpeggiates held chord notes", tag: "midi", icon: Music },
            { type: "midi-input", name: "MIDI In", description: "Hardware MIDI input", tag: "midi", icon: Music },
            { type: "midi-transpose", name: "Transpose", description: "Shift note pitch ± semitones", tag: "midi", icon: Music },
        ],
    },
    {
        name: "Utility",
        color: "#10b981",
        kind: "utility",
        nodes: [
            { type: "speaker", name: "Speaker", description: "Audio output", tag: "utility", icon: Speaker },
            { type: "lfo", name: "LFO", description: "Low frequency modulator (beat-synced)", tag: "utility", icon: Waves },
            { type: "camera-hands", name: "Hand Tracking", description: "MediaPipe hand tracking to param", tag: "utility", icon: Camera },
        ],
    },
    {
        name: "Logic",
        color: "#eab308", // Amber
        kind: "value",
        nodes: [
            { type: "logic-compare", name: "Compare", description: "Compare two values (a > b)", tag: "logic", icon: Cpu },
            { type: "logic-gate", name: "Gate", description: "Boolean logic (AND, OR, NOT)", tag: "logic", icon: Cpu },
            { type: "logic-add", name: "Add", description: "A + B", tag: "logic", icon: Cpu },
            { type: "logic-subtract", name: "Subtract", description: "A - B", tag: "logic", icon: Cpu },
            { type: "logic-multiply", name: "Multiply", description: "A × B", tag: "logic", icon: Cpu },
            { type: "logic-divide", name: "Divide", description: "A ÷ B", tag: "logic", icon: Cpu },
            { type: "logic-condition", name: "Condition", description: "If / Then / Else branching", tag: "logic", icon: Cpu },
        ],
    },
    {
        name: "Value",
        color: "#ef4444",
        kind: "value",
        nodes: [
            { type: "value-bool", name: "Bool", description: "Boolean value source (on/off)", tag: "value", icon: ToggleRight },
            { type: "value-number", name: "Number", description: "Number value source (with optional range)", tag: "value", icon: Hash },
            { type: "value-text", name: "Text", description: "Free text value source", tag: "value", icon: List },
            { type: "value-select", name: "Select", description: "Dropdown enum value source", tag: "value", icon: List },
        ],
    },
];

// Build fast lookup maps
export const NODE_TYPE_MAP: Record<string, { def: NodeEntry; category: CategoryEntry }> = {};
for (const cat of NODE_CATEGORIES) {
    for (const def of cat.nodes) {
        NODE_TYPE_MAP[def.type] = { def, category: cat };
    }
}

export interface UnifiedNodeMeta {
    type: string;
    category: NodeCategoryName;
    accentColor: string; // category color
    kind: CategoryEntry["kind"];
    displayName?: string;
    icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
    description?: string;
}

export function getNodeMeta(type?: string): UnifiedNodeMeta {
    if (!type) {
        return { type: "unknown", category: "Utility", accentColor: "#64748b", kind: "utility" };
    }
    const entry = NODE_TYPE_MAP[type];
    if (!entry) {
        return { type, category: "Utility", accentColor: "#64748b", kind: "utility" };
    }
    return {
        type: entry.def.type,
        category: entry.category.name,
        accentColor: entry.category.color,
        kind: entry.category.kind,
        displayName: entry.def.name,
        icon: entry.def.icon,
        description: entry.def.description,
    };
}

// Convenience: flattened list if needed by search components
export const ALL_NODE_DEFS: NodeEntry[] = NODE_CATEGORIES.flatMap(c => c.nodes);

