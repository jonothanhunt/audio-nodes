import React from "react";

export const NOTE_NAMES = [
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

export interface SequencerGridProps {
    noteCount: number;
    bottomMidi: number;
    lengthClamped: number;
    playingProp: boolean;
    currentStep: number;
    steps: boolean[][];
    toggleStep: (stepIdx: number, noteIdx: number) => void;
    onClearGrid: () => void;
}

export function SequencerGrid({
    noteCount,
    bottomMidi,
    lengthClamped,
    playingProp,
    currentStep,
    steps,
    toggleStep,
    onClearGrid,
}: SequencerGridProps) {
    return (
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
                                    className={`text-[10px] ${isC
                                            ? "font-semibold text-gray-200"
                                            : "text-gray-400"
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
                                            steps[stepIdx]?.[noteIdx] || false;
                                        const rowMidi = bottomMidi + noteIdx;
                                        const isSharp =
                                            NOTE_NAMES[rowMidi % 12].includes("#");

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
                                                    toggleStep(stepIdx, noteIdx);
                                                }}
                                                onPointerDown={(e) => e.stopPropagation()}
                                                className={`w-4 h-4 rounded transition-colors ${active
                                                        ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]"
                                                        : showPlayhead
                                                            ? `${baseRing} ring-1 ring-amber-300/60`
                                                            : baseIdle
                                                    }`}
                                                aria-label={`Step ${stepIdx + 1}, note index ${noteIdx + 1
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
            <div className="mt-3 flex justify-start">
                <button
                    type="button"
                    className="nodrag inline-flex items-center px-2 py-1 rounded border border-gray-600 bg-gray-800 text-xs text-white hover:bg-gray-700"
                    onClick={(e) => {
                        e.stopPropagation();
                        onClearGrid();
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label="Clear all steps"
                >
                    Clear grid
                </button>
            </div>
        </div>
    );
}
