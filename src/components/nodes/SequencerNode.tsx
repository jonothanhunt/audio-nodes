"use client";

import React from "react";
import { NodeShell } from "../node-framework/NodeShell";
import { NodeSpec } from "../node-framework/types";

interface SequencerNodeData {
    length?: number;
    fromNote?: string;
    toNote?: string;
    rateMultiplier?: number;
    playing?: boolean;
    steps?: boolean[][];
    _connectedParams?: string[];
    onParameterChange: (nodeId: string, parameter: string, value: string | number | boolean | boolean[][]) => void;
    onEmitMidi?: (
        sourceId: string,
        events: Array<{ data: [number, number, number]; atFrame?: number; atTimeMs?: number }>,
    ) => void;
    [k: string]: unknown;
}
interface SequencerNodeProps { id: string; selected?: boolean; data: SequencerNodeData; }

const NOTE_NAMES = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
] as const;
const OCTAVES = [0, 1, 2, 3, 4, 5, 6, 7] as const; // reasonable UI range
const NOTE_OPTIONS = OCTAVES.flatMap((oct) =>
    NOTE_NAMES.map((n) => `${n}${oct}`),
);

function noteToMidi(note: string): number {
    // Expect format like 'C4', 'G#3'
    const m = note.match(/^(C#?|D#?|E|F#?|G#?|A#?|B)(-?\d+)$/);
    if (!m) return 60; // fallback C4
    const [, name, oStr] = m as [string, (typeof NOTE_NAMES)[number], string];
    const idx = NOTE_NAMES.indexOf(name);
    const octave = parseInt(oStr, 10);
    if (idx < 0 || Number.isNaN(octave)) return 60;
    // MIDI formula: C-1 = 0 => midi = (octave + 1) * 12 + idx
    return (octave + 1) * 12 + idx;
}

// (Spec now created inside component to allow dynamic renderAfterParams usage.)

export default function SequencerNode({ id, data, selected }: SequencerNodeProps) {
    const { onParameterChange } = data;
    // Defaults
    React.useEffect(() => {
        const ensure = (key: keyof SequencerNodeData, def: string | number | boolean) => {
            if ((data as Record<string, unknown>)[key] == null) onParameterChange(id, key as string, def);
        };
        ensure('length', 16);
        ensure('fromNote', 'C4');
        ensure('toNote', 'C5');
        ensure('rateMultiplier', 1);
        ensure('playing', false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const lengthProp = data.length ?? 16;
    const fromNoteProp = data.fromNote ?? 'C4';
    const toNoteProp = data.toNote ?? 'C5';
    const playingProp = data.playing ?? false;

    const lengthClamped = Math.max(
        1,
        Math.min(
            64,
            Number.isFinite(Number(lengthProp)) ? Number(lengthProp) : 16,
        ),
    );

    const fromMidiRaw = noteToMidi(fromNoteProp);
    const toMidiRaw = noteToMidi(toNoteProp);
    const bottomMidi = Math.min(fromMidiRaw, toMidiRaw);
    const topMidi = Math.max(fromMidiRaw, toMidiRaw);
    const noteCount = topMidi - bottomMidi + 1; // inclusive

    // Helpers to build/normalize grids
    const makeGrid = React.useCallback(
        (cols: number, rows: number, val = false): boolean[][] =>
            Array.from({ length: cols }, () =>
                Array.from({ length: rows }, () => val),
            ),
        [],
    );

    const normalizeGrid = React.useCallback(
        (cols: number, rows: number, src?: boolean[][]): boolean[][] => {
            if (!Array.isArray(src)) return makeGrid(cols, rows, false);
            const out = makeGrid(cols, rows, false);
            for (let c = 0; c < cols; c++) {
                for (let r = 0; r < rows; r++) {
                    out[c][r] = !!src[c]?.[r];
                }
            }
            return out;
        },
        [makeGrid],
    );

    // Steps grid state initialized from data.steps if present
    const [steps, setSteps] = React.useState<boolean[][]>(() =>
        normalizeGrid(
            lengthClamped,
            noteCount,
            Array.isArray(data.steps) ? data.steps : undefined,
        ),
    );

    // On first mount, if steps were absent, persist a default grid once after paint
    const didPersistRef = React.useRef(false);
    React.useEffect(() => {
        if (!didPersistRef.current) {
            if (!Array.isArray(data.steps)) {
                const def = normalizeGrid(lengthClamped, noteCount, undefined);
                onParameterChange(id, "steps", def);
            }
            didPersistRef.current = true;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Playhead state: start at -1 so first sequencerStep event to 0 triggers MIDI emission exactly on quantized start
    const [currentStep, setCurrentStep] = React.useState(-1);
    const prevStepRef = React.useRef<number>(-1);
    const startedRef = React.useRef(false); // becomes true after first step event received

    // External step updates now come from global transport via custom event listener
    React.useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail as { nodeId: string; stepIndex: number };
            if (!detail || detail.nodeId !== id) return;
            setCurrentStep(detail.stepIndex);
            if (!startedRef.current) startedRef.current = true;
        };
        window.addEventListener("audioNodesSequencerStep", handler as EventListener);
        return () => window.removeEventListener("audioNodesSequencerStep", handler as EventListener);
    }, [id]);

    // Emit MIDI on step change
    React.useEffect(() => {
        if (!data || typeof data.onEmitMidi !== "function") return;
        if (!playingProp || !startedRef.current) return; // don't emit until quantized start
        if (currentStep < 0) return;
        const emit = data.onEmitMidi as (
            sourceId: string,
            events: Array<{ data: [number, number, number]; atFrame?: number; atTimeMs?: number }>,
        ) => void;
        const prev = prevStepRef.current;
        const curr = currentStep;
        const events: Array<{ data: [number, number, number] }> = [];
        const channel = 0;
        const NOTE_ON = 0x90 | channel;
        const NOTE_OFF = 0x80 | channel;
        for (let noteIdx = 0; noteIdx < noteCount; noteIdx++) {
            const wasOn = prev >= 0 ? (steps[prev]?.[noteIdx] || false) : false;
            const isOn = steps[curr]?.[noteIdx] || false;
            const midiNote = bottomMidi + noteIdx;
            if (isOn) events.push({ data: [NOTE_ON, midiNote, 100] });
            if (wasOn && !isOn) events.push({ data: [NOTE_OFF, midiNote, 0] });
        }
        if (events.length) emit(id, events);
        prevStepRef.current = curr;
    }, [currentStep, playingProp, bottomMidi, noteCount, steps, id, data]);

    // When stopping, send note-offs to avoid hanging notes
    React.useEffect(() => {
        if (!playingProp) {
            if (!data || typeof data.onEmitMidi !== "function") return;
            const emit = data.onEmitMidi as (
                sourceId: string,
                events: Array<{
                    data: [number, number, number];
                    atFrame?: number;
                    atTimeMs?: number;
                }>,
            ) => void;
            const channel = 0;
            const NOTE_OFF = 0x80 | channel;
            const events: Array<{ data: [number, number, number] }> = [];
            const s = currentStep >= 0 ? (steps[currentStep] || []) : [];
            for (let noteIdx = 0; noteIdx < noteCount; noteIdx++) {
                if (s[noteIdx]) {
                    const midiNote = bottomMidi + noteIdx;
                    events.push({ data: [NOTE_OFF, midiNote, 0] });
                }
            }
            if (events.length) emit(id, events);
            // Reset started flag so re-playing will wait for next quantized step
            startedRef.current = false;
        }
    }, [playingProp, data, steps, currentStep, noteCount, bottomMidi, id]);

    // Adjust steps when length or note range change (preserve absolute MIDI notes)
    const prevRangeRef = React.useRef<{ bottomMidi: number; topMidi: number }>({
        bottomMidi,
        topMidi,
    });
    const lastMappedRef = React.useRef<boolean[][] | null>(null);

    React.useEffect(() => {
        setSteps((prev) => {
            const prevBottom = prevRangeRef.current.bottomMidi;
            const newCols = lengthClamped;
            const newRows = noteCount;
            const next = makeGrid(newCols, newRows, false);
            const colsToCopy = Math.min(prev.length, newCols);
            for (let c = 0; c < colsToCopy; c++) {
                const prevCol = prev[c] || [];
                for (let r = 0; r < prevCol.length; r++) {
                    if (!prevCol[r]) continue;
                    const midi = prevBottom + r; // absolute MIDI of this cell in old grid
                    const newRow = midi - bottomMidi; // map to new grid row index
                    if (newRow >= 0 && newRow < newRows) {
                        next[c][newRow] = true;
                    }
                }
            }
            lastMappedRef.current = next;
            return next;
        });
        setCurrentStep(0);
        // update prev range refs for next remap
        prevRangeRef.current = { bottomMidi, topMidi };
        // persist mapped steps to parent after paint
        setTimeout(() => {
            if (lastMappedRef.current) {
                onParameterChange(id, "steps", lastMappedRef.current);
            }
        }, 0);
    }, [
        lengthClamped,
        bottomMidi,
        topMidi,
        noteCount,
        makeGrid,
        onParameterChange,
        id,
    ]);

    const toggleStep = (stepIdx: number, noteIdx: number) => {
        const next = (() => {
            const draft = steps.map((col) => col.slice());
            if (!draft[stepIdx] || draft[stepIdx].length !== noteCount) {
                draft[stepIdx] = Array.from(
                    { length: noteCount },
                    (_, n) => steps[stepIdx]?.[n] ?? false,
                );
            }
            draft[stepIdx][noteIdx] = !draft[stepIdx][noteIdx];
            return draft;
        })();
        setSteps(next);
        // Persist after render to avoid updating parent during child render
        setTimeout(() => onParameterChange(id, "steps", next), 0);
    };

    const handleClearGrid = () => {
        // Send immediate NOTE_OFF for any notes active in the current step to avoid hangs
        try {
            const emit = data.onEmitMidi as (
                sourceId: string,
                events: Array<{ data: [number, number, number] }>,
            ) => void;
            if (typeof emit === "function") {
                const channel = 0;
                const NOTE_OFF = 0x80 | channel;
                const curr = steps[currentStep] || [];
                const events: Array<{ data: [number, number, number] }> = [];
                for (let noteIdx = 0; noteIdx < noteCount; noteIdx++) {
                    if (curr[noteIdx]) {
                        const midiNote = bottomMidi + noteIdx;
                        events.push({ data: [NOTE_OFF, midiNote, 0] });
                    }
                }
                if (events.length) emit(id, events);
            }
        } catch {
            /* ignore */
        }

        const cleared = makeGrid(lengthClamped, noteCount, false);
        setSteps(cleared);
        setTimeout(() => onParameterChange(id, "steps", cleared), 0);
    };


    const [rateHint, setRateHint] = React.useState(false);

    // Node-local spec (params, help, IO) now dynamic for hint placement
    const spec: NodeSpec = React.useMemo(() => ({
        type: 'sequencer',
    // title omitted (registry provides); accentColor centralized in registry
        params: [
            { key: 'fromNote', kind: 'select', default: 'C4', label: 'From', options: NOTE_OPTIONS },
            { key: 'toNote', kind: 'select', default: 'C5', label: 'To', options: NOTE_OPTIONS },
            { key: 'length', kind: 'number', default: 16, min: 1, max: 64, step: 1, label: 'Length' },
            { key: 'playing', kind: 'bool', default: false, label: 'Play' },
            { key: 'rateMultiplier', kind: 'select', default: '1', label: 'Rate', options: ['0.25','0.5','1','2','4'] },
        ],
        inputs: [],
        outputs: [{ id: 'midi-out', role: 'midi-out', label: 'MIDI Out' }],
        help: {
            description: 'Step sequencer that emits MIDI notes on the global transport. Toggle grid cells to enable notes.',
            inputs: [
                { name: 'From/To', description: 'MIDI note range displayed.' },
                { name: 'Length', description: 'Steps per sequence (1–64).' },
                { name: 'Play', description: 'Quantized start/stop with global bar.' },
                { name: 'Rate', description: 'Speed multiplier vs global BPM.' },
            ],
            outputs: [{ name: 'MIDI Out', description: 'Emits Note On/Off each step.' }]
        },
        renderAfterParams: () => (
            rateHint && playingProp ? <div className="text-[10px] text-amber-400/80 -mt-1 mb-1">Rate change applies next beat</div> : null
        )
    }), [rateHint, playingProp]);

    // Wrapper to intercept play & rate changes for events + hint
    const handleParamChange = React.useCallback((nid: string, key: string, value: unknown) => {
        onParameterChange(nid, key, key === 'rateMultiplier' ? Number(value) : value as (string|number|boolean|boolean[][]));
        if (key === 'playing') {
            try { window.dispatchEvent(new CustomEvent('audioNodesSequencerPlayToggle',{ detail:{ nodeId:nid, play:value }})); } catch {}
        } else if (key === 'rateMultiplier') {
            try { window.dispatchEvent(new CustomEvent('audioNodesSequencerRateChange',{ detail:{ nodeId:nid, rate:Number(value) }})); } catch {}
            setRateHint(true);
            window.setTimeout(()=>setRateHint(false),1600);
        }
    }, [onParameterChange]);

        const grid = (
            <div className="mt-6">
                <div className="flex">
                        {/* Labels column (note names) */}
                        <div className="flex flex-col-reverse gap-1 mr-1">
                            {Array.from({ length: noteCount }).map(
                                (_, noteIdx) => {
                                    const rowMidi = bottomMidi + noteIdx;
                                    const label = NOTE_NAMES[rowMidi % 12];
                                    const isC = rowMidi % 12 === 0;
                                    return (
                                        <div
                                            key={noteIdx}
                                            className="h-4 w-4 flex items-center justify-end"
                                        >
                                            <span
                                                className={`text-[10px] ${
                                                    isC
                                                        ? "font-semibold text-gray-200"
                                                        : "text-gray-400"
                                                }`}
                                            >
                                                {label}
                                            </span>
                                        </div>
                                    );
                                },
                            )}
                        </div>

                        {/* Steps columns */}
                        <div className="inline-flex">
                            {Array.from({ length: lengthClamped }).map(
                                (_, stepIdx) => {
                                    const showPlayhead =
                                        playingProp && currentStep >= 0 && stepIdx === currentStep;
                                    return (
                                        <div
                                            key={stepIdx}
                                            className="flex flex-col items-center mr-1"
                                        >
                                            {/* Notes Grid (top = highest note) */}
                                            <div className="flex flex-col-reverse gap-1">
                                                {Array.from({
                                                    length: noteCount,
                                                }).map((_, noteIdx) => {
                                                    const active =
                                                        steps[stepIdx]?.[
                                                            noteIdx
                                                        ] || false;
                                                    const rowMidi =
                                                        bottomMidi + noteIdx;
                                                    const isSharp =
                                                        NOTE_NAMES[
                                                            rowMidi % 12
                                                        ].includes("#");

                                                    const baseIdle = isSharp
                                                        ? "bg-gray-800 hover:bg-gray-700"
                                                        : "bg-gray-700 hover:bg-gray-600";
                                                    const baseRing = isSharp
                                                        ? "bg-gray-800"
                                                        : "bg-gray-700";

                                                    return (
                                                        <button
                                                            key={noteIdx}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleStep(
                                                                    stepIdx,
                                                                    noteIdx,
                                                                );
                                                            }}
                                                            onPointerDown={(
                                                                e,
                                                            ) =>
                                                                e.stopPropagation()
                                                            }
                                                            className={`w-4 h-4 rounded transition-colors ${
                                                                active
                                                                    ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]"
                                                                    : showPlayhead
                                                                      ? `${baseRing} ring-1 ring-amber-300/60`
                                                                      : baseIdle
                                                            }`}
                                                            aria-label={`Step ${stepIdx + 1}, note index ${
                                                                noteIdx + 1
                                                            }`}
                                                        />
                                                    );
                                                })}
                                                    </div>
                                                </div>
                                            );
                                },
                            )}
                        </div>
                    </div>
                <div className="mt-3 flex justify-start">
                    <button
                        type="button"
                        className="nodrag inline-flex items-center px-2 py-1 rounded border border-gray-600 bg-gray-800 text-xs text-white hover:bg-gray-700"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleClearGrid();
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        aria-label="Clear all steps"
                    >
                        Clear grid
                    </button>
                </div>
            </div>
        );

        return (
            <NodeShell
                id={id}
                data={data as unknown as Record<string, unknown>}
                spec={spec}
                selected={selected}
                onParameterChange={handleParamChange}
            >
                {grid}
            </NodeShell>
        );
}

