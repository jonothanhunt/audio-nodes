"use client";

import React from "react";
import { Handle, Position } from "reactflow";
import { Music } from "lucide-react";

interface SequencerNodeProps {
  id: string;
  selected?: boolean;
  data: {
    length?: number;
    fromNote?: string; // e.g., 'C4'
    toNote?: string; // e.g., 'C5'
    bpm?: number;
    playing?: boolean;
    onParameterChange: (
      nodeId: string,
      parameter: string,
      value: string | number | boolean
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

export default function SequencerNode({
  id,
  data,
  selected,
}: SequencerNodeProps) {
  const { onParameterChange } = data;
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

  // Persist defaults if missing
  React.useEffect(() => {
    if (data.length == null) onParameterChange(id, "length", 16);
    if (data.fromNote == null) onParameterChange(id, "fromNote", "C4");
    if (data.toNote == null) onParameterChange(id, "toNote", "C5");
    if (data.bpm == null) onParameterChange(id, "bpm", 120);
    if (data.playing == null) onParameterChange(id, "playing", false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Steps grid state
  const [steps, setSteps] = React.useState<boolean[][]>(() => {
    return Array.from({ length: lengthClamped }, () =>
      Array.from({ length: noteCount }, () => false)
    );
  });

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
      if (isOn && !wasOn) {
        events.push({ data: [NOTE_ON, midiNote, 100] });
      } else if (wasOn && !isOn) {
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

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const outRef = React.useRef<HTMLDivElement | null>(null);
  const playRef = React.useRef<HTMLDivElement | null>(null);
  const bpmRef = React.useRef<HTMLDivElement | null>(null);

  const [outTop, setOutTop] = React.useState(0);
  const [playTop, setPlayTop] = React.useState(0);
  const [bpmTop, setBpmTop] = React.useState(0);

  const compute = React.useCallback(() => {
    const rootEl = rootRef.current as HTMLElement | null;
    if (!rootEl) return;
    const centerFromRoot = (el: HTMLElement | null) => {
      if (!el) return 0;
      let top = 0;
      let curr: HTMLElement | null = el;
      while (curr && curr !== rootEl) {
        top += curr.offsetTop || 0;
        curr = (curr.offsetParent as HTMLElement) || null;
      }
      return top + (el.offsetHeight || 0) / 2;
    };
    setOutTop(centerFromRoot(outRef.current));
    setPlayTop(centerFromRoot(playRef.current));
    setBpmTop(centerFromRoot(bpmRef.current));
  }, []);

  React.useLayoutEffect(() => {
    compute();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => compute());
      if (rootRef.current) ro.observe(rootRef.current);
      if (cardRef.current) ro.observe(cardRef.current);
      if (outRef.current) ro.observe(outRef.current);
      if (playRef.current) ro.observe(playRef.current);
      if (bpmRef.current) ro.observe(bpmRef.current);
      return () => ro.disconnect();
    }
    const onResize = () => compute();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [compute]);

  // Adjust steps when length or note range change
  React.useEffect(() => {
    setSteps((prev) => {
      const next = Array.from({ length: lengthClamped }, (_, s) =>
        Array.from({ length: noteCount }, (_, n) => prev[s]?.[n] ?? false)
      );
      return next;
    });
    setCurrentStep(0);
  }, [lengthClamped, noteCount]);

  const toggleStep = (stepIdx: number, noteIdx: number) => {
    setSteps((prev) => {
      const next = prev.map((col) => col.slice());
      if (!next[stepIdx] || next[stepIdx].length !== noteCount) {
        next[stepIdx] = Array.from(
          { length: noteCount },
          (_, n) => prev[stepIdx]?.[n] ?? false
        );
      }
      next[stepIdx][noteIdx] = !next[stepIdx][noteIdx];
      return next;
    });
  };

  return (
    <div className="relative" ref={rootRef}>
      {selected && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-xs text-gray-500">
          ID: {id}
        </div>
      )}

      <div
        ref={cardRef}
        className={`relative bg-gray-900 rounded-lg p-4 shadow-lg border ${
          selected ? "border-amber-500" : "border-amber-500/30"
        }`}
      >
        {/* Subtle top-left gradient (Sequencing = amber) */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/10 via-amber-500/0 to-transparent rounded-lg" />
        {/* Header */}
        <div className="flex items-center gap-2 mb-3 relative">
          <Music className="w-4 h-4 text-amber-400" />
          <span className="text-amber-400 text-sm font-medium">Sequencer</span>
        </div>

        {/* Controls + Output label */}
        <div className="grid grid-cols-[minmax(14rem,_auto)_auto] gap-x-8 gap-y-2">
          {/* Stack controls vertically like other nodes */}
          <div className="space-y-2">
            <div className="relative flex items-center">
              <label className="block text-xs text-gray-300 w-24">Length</label>
              <input
                type="number"
                value={lengthClamped}
                min={1}
                max={64}
                onChange={(e) =>
                  onParameterChange(
                    id,
                    "length",
                    Math.max(1, Math.min(64, Number(e.target.value)))
                  )
                }
                className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white w-20 text-center"
              />
            </div>
            {/* Range From/To */}
            <div className="relative flex items-center">
              <label className="block text-xs text-gray-300 w-24">From</label>
              <select
                value={fromNoteProp}
                onChange={(e) => {
                  const newFrom = e.target.value;
                  onParameterChange(id, "fromNote", newFrom);
                  // If from becomes higher than to, clamp to to
                  const newFromMidi = noteToMidi(newFrom);
                  if (newFromMidi > topMidi) {
                    onParameterChange(id, "toNote", newFrom);
                  }
                }}
                className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white w-24"
              >
                {NOTE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative flex items-center">
              <label className="block text-xs text-gray-300 w-24">To</label>
              <select
                value={toNoteProp}
                onChange={(e) => {
                  const newTo = e.target.value;
                  onParameterChange(id, "toNote", newTo);
                  const newToMidi = noteToMidi(newTo);
                  if (newToMidi < bottomMidi) {
                    onParameterChange(id, "fromNote", newTo);
                  }
                }}
                className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white w-24"
              >
                {NOTE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            {/* Play control (bool) */}
            <div ref={playRef} className="relative flex items-center">
              <label className="block text-xs text-gray-300 w-24">Play</label>
              <label className="flex items-center gap-2 text-xs text-gray-300">
                <input
                  type="checkbox"
                  checked={!!playingProp}
                  onChange={(e) =>
                    onParameterChange(id, "playing", e.target.checked)
                  }
                  className="bg-gray-800 border border-gray-600 rounded"
                />
                <span>{playingProp ? "On" : "Off"}</span>
              </label>
            </div>
            {/* BPM control */}
            <div ref={bpmRef} className="relative flex items-center">
              <label className="block text-xs text-gray-300 w-24">BPM</label>
              <input
                type="number"
                value={bpmClamped}
                min={20}
                max={600}
                onChange={(e) =>
                  onParameterChange(
                    id,
                    "bpm",
                    Math.max(20, Math.min(600, Number(e.target.value)))
                  )
                }
                className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white w-20 text-center"
              />
            </div>
          </div>

          {/* Output label to anchor MIDI handle */}
          <div ref={outRef} className="flex items-center justify-end">
            <span className="text-xs text-gray-300 mr-2">MIDI Out</span>
          </div>
        </div>

        {/* Step Grid */}
        <div className="mt-6">
          <div className="flex">
            {/* Labels column (note names) - narrowed width and margin */}
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
                            onClick={() => toggleStep(stepIdx, noteIdx)}
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

      {/* Left-side input handles */}
      {/* Play = triangle (bool) */}
      <Handle
        type="target"
        position={Position.Left}
        id="play"
        className="!w-3 !h-3 !rounded-none !bg-gray-200 !border !border-gray-300"
        style={{
          top: playTop,
          transform: "translateY(-50%)",
          left: -6,
          clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
        }}
      />
      {/* BPM = diamond (numeric param) */}
      <Handle
        type="target"
        position={Position.Left}
        id="bpm"
        className="!w-3 !h-3 !bg-gray-200 !border !border-gray-300 !rounded-none"
        style={{
          top: bpmTop,
          transform: "translateY(-50%) rotate(45deg)",
          left: -6,
        }}
      />

      {/* Right-side output handle: MIDI = square */}
      <Handle
        type="source"
        position={Position.Right}
        id="midi"
        className="!w-3 !h-3 !bg-gray-200 !border !border-gray-300 !rounded-none"
        style={{ top: outTop, transform: "translateY(-50%)", right: -6 }}
      />
    </div>
  );
}
