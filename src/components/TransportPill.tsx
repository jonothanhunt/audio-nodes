"use client";
import React from "react";
import { AudioManager } from "@/lib/audioManager";

interface TransportPillProps {
  audioManager: AudioManager;
}

// Bottom-center transport pill: beat LED, BPM input, Sync button
export function TransportPill({ audioManager }: TransportPillProps) {
  const engineBpmRef = React.useRef<number>(audioManager.getBpm());
  const [inputBpmStr, setInputBpmStr] = React.useState<string>(String(engineBpmRef.current));
  const [editingBpm, setEditingBpm] = React.useState(false);
  const [pendingBpmTarget, setPendingBpmTarget] = React.useState<number | null>(null);
  const lastCommittedBpmRef = React.useRef<number>(engineBpmRef.current);
  const [beatActive, setBeatActive] = React.useState<boolean>(false);
  const halfBeatTimerRef = React.useRef<number | null>(null);
  const [isBarOneBeat, setIsBarOneBeat] = React.useState(false);

  // Subscribe to beat events from AudioManager
  React.useEffect(() => {
  const off = audioManager.onBeat((beat, bpmNow) => {
      engineBpmRef.current = bpmNow;
      if (pendingBpmTarget != null && Math.round(bpmNow) === Math.round(pendingBpmTarget)) {
        setPendingBpmTarget(null);
      }
      if (!editingBpm) {
        setInputBpmStr(String(Math.round(bpmNow)));
      }
      lastCommittedBpmRef.current = bpmNow;
  setIsBarOneBeat(beat === 0);
      setBeatActive(true);
      if (halfBeatTimerRef.current) {
        window.clearTimeout(halfBeatTimerRef.current);
        halfBeatTimerRef.current = null;
      }
      const halfMs = (60000 / Math.max(20, Math.min(300, bpmNow))) / 2;
      halfBeatTimerRef.current = window.setTimeout(() => {
        setBeatActive(false);
      }, halfMs);
      // Persist BPM globally for project saving
      try { (window as unknown as { __audioNodesTransportBpm?: number }).__audioNodesTransportBpm = bpmNow; } catch {}
    });
    return () => {
      off();
      if (halfBeatTimerRef.current) {
        window.clearTimeout(halfBeatTimerRef.current);
        halfBeatTimerRef.current = null;
      }
    };
  }, [audioManager, editingBpm, pendingBpmTarget]);

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-end justify-center">
      <div className="pointer-events-auto flex items-center gap-3 px-4 py-2 rounded-full bg-gray-800/80 backdrop-blur-md border border-gray-700/70 shadow-lg">
        {/* Beat LED */}
        <div
          aria-label="Beat indicator"
          className={
            "w-2.5 h-2.5 rounded-full transition-all duration-150 " +
            (beatActive ? "bg-red-500" : "bg-gray-500") +
            (isBarOneBeat && beatActive ? " scale-125 shadow-[0_0_6px_2px_rgba(239,68,68,0.6)]" : "")
          }
        />
        {/* BPM Input */}
        <div className="flex items-center gap-1 text-xs text-gray-300">
          <label htmlFor="global-bpm" className="sr-only">
            BPM
          </label>
          <input
            id="global-bpm"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Global BPM"
            value={inputBpmStr}
            onFocus={() => setEditingBpm(true)}
            onChange={(e) => {
              const raw = e.target.value;
              let cleaned = raw.replace(/[^0-9]/g, "");
              if (cleaned.length > 3) cleaned = cleaned.slice(0, 3);
              setInputBpmStr(cleaned);
            }}
            onBeforeInput={(e) => {
              const anyE = e as unknown as { data?: string; preventDefault: () => void };
              const data = anyE.data;
              if (data && /\D/.test(data)) anyE.preventDefault();
            }}
            onPaste={(e) => {
              const txt = e.clipboardData?.getData("text") || "";
              const digits = txt.replace(/[^0-9]/g, "").slice(0, 3);
              e.preventDefault();
              setInputBpmStr(digits);
            }}
            onBlur={() => {
              setEditingBpm(false);
              const trimmed = inputBpmStr.trim();
              if (trimmed === "") {
                setInputBpmStr(String(lastCommittedBpmRef.current));
                return;
              }
              let v = parseInt(trimmed, 10);
              if (!isFinite(v)) {
                setInputBpmStr(String(lastCommittedBpmRef.current));
                return;
              }
              v = Math.max(20, Math.min(300, v));
              setInputBpmStr(String(v));
              setPendingBpmTarget(v);
              audioManager.setBpm(v);
              lastCommittedBpmRef.current = v;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                setInputBpmStr(String(lastCommittedBpmRef.current));
                setEditingBpm(false);
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                const delta = e.shiftKey ? 5 : 1;
                const baseParsed = parseInt(inputBpmStr || "", 10);
                const base = editingBpm && isFinite(baseParsed) ? baseParsed : lastCommittedBpmRef.current;
                const next = Math.max(20, Math.min(300, base + (e.key === "ArrowUp" ? delta : -delta)));
                setInputBpmStr(String(next));
              }
            }}
            className={
              "w-14 text-center bg-gray-900/70 rounded px-2 py-1 text-gray-100 focus:outline-none appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none border " +
              (pendingBpmTarget != null
                ? "border-red-500/70 ring-2 ring-red-500/40"
                : "border-gray-600/70 focus:ring-2 focus:ring-red-500/60 focus:border-red-500/60")
            }
          />
          <span className="text-gray-400">BPM</span>
        </div>
        {/* Sync Button */}
        <button
          type="button"
          onClick={() => {
            audioManager.syncAllNextBeat();
          }}
          className="text-xs font-medium px-3 py-1 rounded-md bg-gray-700/70 hover:bg-gray-600 text-gray-100 border border-gray-600/60 focus:outline-none focus:ring-2 focus:ring-red-500/50"
          title="Sync all sequencers to next beat"
        >
          Sync sequencers
        </button>
      </div>
    </div>
  );
}

export default TransportPill;
