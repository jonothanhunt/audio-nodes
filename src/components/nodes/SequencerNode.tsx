"use client";

import React from "react";
import { Music } from "lucide-react";
import { getNodeMeta } from '@/lib/nodeRegistry';
import { NodeUIProvider, useNodeUI } from '../node-ui/NodeUIProvider';
import { HandleLayer } from '../node-ui/HandleLayer';
import { NumberParam } from '../node-ui/params/NumberParam';
import { SelectParam } from '../node-ui/params/SelectParam';
import { BooleanParam } from '../node-ui/params/BooleanParam';

interface SequencerNodeProps {
  id: string;
  selected?: boolean;
  data: {
    length?: number;
    fromNote?: string; // e.g., 'C4'
    toNote?: string; // e.g., 'C5'
    bpm?: number;
    playing?: boolean;
    steps?: boolean[][]; // persisted grid [step][noteIdx]
    onParameterChange: (
      nodeId: string,
      parameter: string,
      value: string | number | boolean | boolean[][]
    ) => void;
    onEmitMidi?: (
      sourceId: string,
      events: Array<{ data: [number, number, number]; atFrame?: number; atTimeMs?: number }>
    ) => void;
  };
}

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
  NOTE_NAMES.map((n) => `${n}${oct}`)
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

export default function SequencerNode({ id, data, selected }: SequencerNodeProps) {
  const { accentColor } = getNodeMeta('sequencer');
  const { onParameterChange } = data;

  // Ensure defaults for scalars
  React.useEffect(() => {
    const ensure = (key: keyof SequencerNodeProps['data'], def: string | number | boolean) => {
      if ((data as Record<string, unknown>)[key] == null) {
        onParameterChange(id, key as string, def);
      }
    };
    ensure('length', 16);
    ensure('fromNote', 'C4');
    ensure('toNote', 'C5');
    ensure('bpm', 120);
    ensure('playing', false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lengthProp = data.length ?? 16;
  const fromNoteProp = data.fromNote ?? "C4";
  const toNoteProp = data.toNote ?? "C5";
  const bpmProp = data.bpm ?? 120;
  const playingProp = data.playing ?? false;

  const lengthClamped = Math.max(
    1,
    Math.min(64, Number.isFinite(Number(lengthProp)) ? Number(lengthProp) : 16)
  );
  const bpmClamped = Math.max(
    20,
    Math.min(600, Number.isFinite(Number(bpmProp)) ? Number(bpmProp) : 120)
  );

  const fromMidiRaw = noteToMidi(fromNoteProp);
  const toMidiRaw = noteToMidi(toNoteProp);
  const bottomMidi = Math.min(fromMidiRaw, toMidiRaw);
  const topMidi = Math.max(fromMidiRaw, toMidiRaw);
  const noteCount = topMidi - bottomMidi + 1; // inclusive

  // Helpers to build/normalize grids
  const makeGrid = React.useCallback((cols: number, rows: number, val = false): boolean[][] => (
    Array.from({ length: cols }, () => Array.from({ length: rows }, () => val))
  ), []);

  const normalizeGrid = React.useCallback((cols: number, rows: number, src?: boolean[][]): boolean[][] => {
    if (!Array.isArray(src)) return makeGrid(cols, rows, false);
    const out = makeGrid(cols, rows, false);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        out[c][r] = !!(src[c]?.[r]);
      }
    }
    return out;
  }, [makeGrid]);

  // Steps grid state initialized from data.steps if present
  const [steps, setSteps] = React.useState<boolean[][]>(() => (
    normalizeGrid(lengthClamped, noteCount, Array.isArray(data.steps) ? data.steps : undefined)
  ));

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

  // Playhead state
  const [currentStep, setCurrentStep] = React.useState(0);
  const timerRef = React.useRef<number | null>(null);
  const prevStepRef = React.useRef<number>(0);

  React.useEffect(() => {
    // Clear any existing timer
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (playingProp) {
      const intervalMs = Math.max(1, Math.round(60000 / bpmClamped));
      timerRef.current = window.setInterval(() => {
        setCurrentStep((prev) => (prev + 1) % lengthClamped);
      }, intervalMs);
    } else {
      setCurrentStep(0);
    }
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [playingProp, bpmClamped, lengthClamped]);

  // Emit MIDI on step change
  React.useEffect(() => {
    if (!data || typeof data.onEmitMidi !== 'function') return;
    const emit = data.onEmitMidi as (sourceId: string, events: Array<{ data: [number, number, number]; atFrame?: number; atTimeMs?: number }>) => void;
    if (!playingProp) return;

    const prev = prevStepRef.current;
    const curr = currentStep;

    const events: Array<{ data: [number, number, number] }> = [];
    const channel = 0; // default MIDI channel 1
    const NOTE_ON = 0x90 | channel;
    const NOTE_OFF = 0x80 | channel;

    for (let noteIdx = 0; noteIdx < noteCount; noteIdx++) {
      const wasOn = steps[prev]?.[noteIdx] || false;
      const isOn = steps[curr]?.[noteIdx] || false;
      const midiNote = bottomMidi + noteIdx;
      if (isOn) {
        // Retrigger even if it was already on in the previous step
        events.push({ data: [NOTE_ON, midiNote, 100] });
      }
      if (wasOn && !isOn) {
        events.push({ data: [NOTE_OFF, midiNote, 0] });
      }
    }

    if (events.length) emit(id, events);
    prevStepRef.current = curr;
  }, [currentStep, playingProp, bottomMidi, noteCount, steps, id, data]);

  // When stopping, send note-offs to avoid hanging notes
  React.useEffect(() => {
    if (!playingProp) {
      if (!data || typeof data.onEmitMidi !== 'function') return;
      const emit = data.onEmitMidi as (sourceId: string, events: Array<{ data: [number, number, number]; atFrame?: number; atTimeMs?: number }>) => void;
      const channel = 0;
      const NOTE_OFF = 0x80 | channel;
      const events: Array<{ data: [number, number, number] }> = [];
      const s = steps[currentStep] || [];
      for (let noteIdx = 0; noteIdx < noteCount; noteIdx++) {
        if (s[noteIdx]) {
          const midiNote = bottomMidi + noteIdx;
          events.push({ data: [NOTE_OFF, midiNote, 0] });
        }
      }
      if (events.length) emit(id, events);
    }
  }, [playingProp, data, steps, currentStep, noteCount, bottomMidi, id]);

  // Adjust steps when length or note range change (preserve absolute MIDI notes)
  const prevRangeRef = React.useRef<{ bottomMidi: number; topMidi: number }>({ bottomMidi, topMidi });
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
  }, [lengthClamped, bottomMidi, topMidi, noteCount, makeGrid, onParameterChange, id]);

  const toggleStep = (stepIdx: number, noteIdx: number) => {
    const next = (() => {
      const draft = steps.map((col) => col.slice());
      if (!draft[stepIdx] || draft[stepIdx].length !== noteCount) {
        draft[stepIdx] = Array.from({ length: noteCount }, (_, n) => steps[stepIdx]?.[n] ?? false);
      }
      draft[stepIdx][noteIdx] = !draft[stepIdx][noteIdx];
      return draft;
    })();
    setSteps(next);
    // Persist after render to avoid updating parent during child render
    setTimeout(() => onParameterChange(id, "steps", next), 0);
  };

  const numericKeys = ['length', 'bpm'];
  const stringKeys = ['fromNote', 'toNote'];
  const boolKeys = ['playing'];

  const get = (key: keyof SequencerNodeProps['data']) => (data as Record<string, unknown>)[key];

  return (
    <NodeUIProvider accentColor={accentColor} numericKeys={numericKeys} stringKeys={stringKeys} boolKeys={boolKeys}>
      {selected && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-xs text-gray-500">ID: {id}</div>
      )}

      <div
        className={`relative bg-gray-900 rounded-lg p-4 shadow-lg border`}
        style={{ borderColor: accentColor, boxShadow: selected ? `0 0 0 1px ${accentColor}, 0 0 12px -2px ${accentColor}` : undefined }}
      >
        <div className="pointer-events-none absolute inset-0 rounded-lg" style={{ background: `linear-gradient(135deg, ${accentColor}26, transparent 65%)` }} />
        {/* Header */}
        <div className="flex items-center gap-2 mb-3 relative">
          <Music className="w-4 h-4" style={{ color: accentColor }} />
          <span className="title-font font-w-70 text-sm" style={{ color: accentColor }}>Sequencer</span>
        </div>

        {/* Controls + Output label */}
        <div className="grid grid-cols-[minmax(16rem,_auto)_auto] gap-y-2 gap-x-4">
          <div className="space-y-2 col-span-1">
            <SelectParam
              nodeId={id}
              paramKey="fromNote"
              label="From"
              value={String(get('fromNote') ?? 'C4')}
              options={NOTE_OPTIONS}
              onParameterChange={onParameterChange as (nid: string, param: string, value: string) => void}
              widthClass="w-24"
            />
            <SelectParam
              nodeId={id}
              paramKey="toNote"
              label="To"
              value={String(get('toNote') ?? 'C5')}
              options={NOTE_OPTIONS}
              onParameterChange={onParameterChange as (nid: string, param: string, value: string) => void}
              widthClass="w-24"
            />
            <NumberParam
              nodeId={id}
              paramKey="length"
              label="Length"
              value={Number(get('length') ?? 16)}
              min={1}
              max={64}
              step={1}
              onParameterChange={onParameterChange as (nid: string, param: string, value: number) => void}
            />
            <BooleanParam
              nodeId={id}
              paramKey="playing"
              label="Play"
              value={Boolean(get('playing') ?? false)}
              onParameterChange={onParameterChange as (nid: string, param: string, value: boolean) => void}
            />
            <NumberParam
              nodeId={id}
              paramKey="bpm"
              label="BPM"
              value={Number(get('bpm') ?? 120)}
              min={20}
              max={600}
              step={1}
              onParameterChange={onParameterChange as (nid: string, param: string, value: number) => void}
            />
          </div>
          <div className="flex flex-col col-span-1">
            <MidiOutRow />
          </div>
        </div>

        {/* Step Grid */}
        <div className="mt-6">
          <div className="flex">
            {/* Labels column (note names) */}
            <div className="flex flex-col-reverse gap-1 mr-1">
              {Array.from({ length: noteCount }).map((_, noteIdx) => {
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
                        isC ? "font-semibold text-gray-200" : "text-gray-400"
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Steps columns */}
            <div className="inline-flex">
              {Array.from({ length: lengthClamped }).map((_, stepIdx) => {
                const showPlayhead = playingProp && stepIdx === currentStep;
                return (
                  <div key={stepIdx} className="flex flex-col items-center mr-1">
                    {/* Notes Grid (top = highest note) */}
                    <div className="flex flex-col-reverse gap-1">
                      {Array.from({ length: noteCount }).map((_, noteIdx) => {
                        const active = steps[stepIdx]?.[noteIdx] || false;
                        const rowMidi = bottomMidi + noteIdx;
                        const isSharp = NOTE_NAMES[rowMidi % 12].includes("#");

                        const baseIdle = isSharp
                          ? "bg-gray-800 hover:bg-gray-700"
                          : "bg-gray-700 hover:bg-gray-600";
                        const baseRing = isSharp ? "bg-gray-800" : "bg-gray-700";

                        return (
                          <button
                            key={noteIdx}
                            onClick={(e) => { e.stopPropagation(); toggleStep(stepIdx, noteIdx); }}
                            onPointerDown={(e) => e.stopPropagation()}
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
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Render handles: param handles on the left; only a MIDI Out on the right */}
      <HandleLayer includeMidiIn={false} outputId="midi-out" outputVariant="midi" />
    </NodeUIProvider>
  );
}

function MidiOutRow() {
  const { outputEl } = useNodeUI();
  return (
    <div className="relative flex items-center justify-end" ref={el => outputEl(el)}>
      <span className="text-xs text-gray-300 mr-2">MIDI Out</span>
    </div>
  );
}
