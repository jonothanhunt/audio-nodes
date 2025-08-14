"use client";
import React from "react";
import { Volume2, VolumeX } from 'lucide-react';
import { AudioManager } from "@/lib/audioManager";
import RecordingPreviewModal, { RecordingPreview } from "./RecordingPreviewModal";

interface TransportPillProps {
  audioManager: AudioManager;
}

const MuteButton: React.FC<{ audioManager: AudioManager }> = ({ audioManager }) => {
  const [muted, setMuted] = React.useState(() => audioManager.isUserMuted());
  const toggle = () => {
    audioManager.setUserMuted(!muted);
    setMuted(!muted);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      title={muted ? 'Unmute engine output' : 'Mute engine output'}
      className={`flex items-center justify-center text-xs font-semibold px-3 py-2 border shadow-lg backdrop-blur-md transition-colors focus:outline-none focus:ring-2 rounded-md ${muted ? 'bg-red-900/85 hover:bg-red-700 text-white border-red-800/70 focus:ring-red-500/50' : 'bg-gray-800/80 hover:bg-gray-700/80 text-gray-100 border-gray-700/70 focus:ring-purple-500/50'}`}
      style={{ width: 60 }}
    >
  {muted ? <VolumeX size={16} strokeWidth={2} /> : <Volume2 size={16} strokeWidth={2} />}
    </button>
  );
};

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
  const [recording, setRecording] = React.useState<boolean>(false);
  const [recordElapsed, setRecordElapsed] = React.useState<number>(0);
  const recordTimerRef = React.useRef<number | null>(null);
  const downloadUrlRef = React.useRef<string | null>(null);
  const [preview, setPreview] = React.useState<RecordingPreview | null>(null);
  // Drag state
  // Absolute (top-left) position within viewport (after translate). Stored under v2 key.
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  // Start at (0,0) for SSR/first client render to avoid hydration mismatch; we read stored position after mount.
  const [pos, setPos] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [positionReady, setPositionReady] = React.useState(false);
  const draggingRef = React.useRef(false);
  const dragStartRef = React.useRef<{ mx: number; my: number; x: number; y: number }|null>(null);

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

  // Cleanup object URL on unmount
  React.useEffect(()=>()=>{ if (downloadUrlRef.current) { URL.revokeObjectURL(downloadUrlRef.current); downloadUrlRef.current = null; } },[]);

  const toggleRecord = React.useCallback(()=>{
    if (!recording) {
      const ok = audioManager.startRecording((blob, dur)=>{
        // Prepare WAV/WEBM save dialog (download link)
        if (downloadUrlRef.current) { URL.revokeObjectURL(downloadUrlRef.current); downloadUrlRef.current = null; }
        const url = URL.createObjectURL(blob);
        downloadUrlRef.current = url;
        setPreview({ url, dur, type: blob.type || 'audio/wav' });
      });
      if (ok) {
        setRecording(true);
        setRecordElapsed(0);
        if (recordTimerRef.current) { clearInterval(recordTimerRef.current); }
        recordTimerRef.current = window.setInterval(()=>{
          setRecordElapsed(e=>e+0.25); // quarter second resolution
        }, 250);
      }
    } else {
      audioManager.stopRecording();
      setRecording(false);
      if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    }
  }, [audioManager, recording]);

  // Persist position (v2 key) only after initialization to avoid saving (0,0) placeholder
  React.useEffect(()=>{ if (!positionReady) return; try { localStorage.setItem('transport-pill-pos-v2', JSON.stringify(pos)); } catch {} }, [pos, positionReady]);

  // Helper to get dynamic top boundary (bottom of save panel) and margins
  const getBoundaries = React.useCallback(() => {
    const margin = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let topBoundary = margin;
    try {
      const panel = document.querySelector('[data-save-load-panel]');
      if (panel) {
        const r = (panel as HTMLElement).getBoundingClientRect();
        // Allow pill higher: align with panel top instead of bottom (plus margin to avoid overlap)
        topBoundary = Math.max(topBoundary, r.top + margin);
      }
    } catch {}
    return { margin, vw, vh, topBoundary };
  }, []);

  // Initialize default position (center-bottom) if no valid stored v2.
  React.useEffect(()=>{
    if (typeof window === 'undefined') return;
    let storedRaw: string | null = null;
    try { storedRaw = localStorage.getItem('transport-pill-pos-v2'); } catch {}
    if (storedRaw) {
      try {
        const parsed = JSON.parse(storedRaw) as { x: number; y: number };
        const { topBoundary, margin, vw, vh } = getBoundaries();
        // Validate stored coordinates within viewport-ish bounds
        if (parsed.x >= 0 && parsed.y >= 0) {
          // Clamp to current boundaries to avoid off-screen
          const el = containerRef.current;
          const w = el?.offsetWidth ?? 400;
          const h = el?.offsetHeight ?? 72;
          let nx = parsed.x; let ny = parsed.y;
          if (nx > vw - margin - w) nx = vw - margin - w;
          if (ny > vh - margin - h) ny = vh - margin - h;
          if (nx < margin) nx = margin;
          if (ny < topBoundary) ny = topBoundary;
          setPos({ x: nx, y: ny });
          setPositionReady(true);
          return; // done
        }
      } catch {}
    }
    const setDefault = () => {
      const el = containerRef.current;
      const { vw, vh, margin, topBoundary } = getBoundaries();
      const w = el?.offsetWidth ?? 400; // rough fallback
      const h = el?.offsetHeight ?? 72; // rough fallback
      const x = Math.max(margin, (vw - w) / 2);
      const y = Math.max(topBoundary, vh - h - 48); // ensure below save panel
      setPos({ x, y });
      setPositionReady(true);
    };
    // Use rAF so layout settled
    requestAnimationFrame(setDefault);
    window.setTimeout(setDefault, 200); // safety reflow after fonts
  }, [getBoundaries]);

  // Clamp position on resize so pill stays within margins.
  React.useEffect(()=>{
    const onResize = () => {
      const { margin, vw, vh, topBoundary } = getBoundaries();
      const el = containerRef.current;
      const w = el?.offsetWidth ?? 0;
      const h = el?.offsetHeight ?? 0;
      setPos(p => {
        let nx = p.x; let ny = p.y;
        if (nx > vw - margin - w) nx = vw - margin - w;
        if (ny > vh - margin - h) ny = vh - margin - h;
        if (nx < margin) nx = margin;
        if (ny < topBoundary) ny = topBoundary;
        if (nx === p.x && ny === p.y) return p; // no change
        return { x: nx, y: ny };
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [getBoundaries]);

  const updateDragPosition = (clientX: number, clientY: number) => {
    if (!dragStartRef.current) return;
    const dx = clientX - dragStartRef.current.mx;
    const dy = clientY - dragStartRef.current.my;
    let nx = dragStartRef.current.x + dx;
    let ny = dragStartRef.current.y + dy;
    const { margin, vw, vh, topBoundary } = getBoundaries();
    const el = containerRef.current;
    const w = el?.offsetWidth ?? 0;
    const h = el?.offsetHeight ?? 0;
    if (nx < margin) nx = margin;
    if (nx > vw - margin - w) nx = vw - margin - w;
    if (ny < topBoundary) ny = topBoundary;
    if (ny > vh - margin - h) ny = vh - margin - h;
    setPos({ x: nx, y: ny });
  };
  const onHandlePointerDown = (e: React.PointerEvent)=>{
    draggingRef.current = true;
    dragStartRef.current = { mx: e.clientX, my: e.clientY, x: pos.x, y: pos.y };
    const move = (ev: PointerEvent)=>{ if (!draggingRef.current) return; updateDragPosition(ev.clientX, ev.clientY); };
    const up = ()=>{ draggingRef.current = false; dragStartRef.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <>
    <div
      ref={containerRef}
      className="pointer-events-none absolute z-50 flex items-end justify-center transition-opacity"
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, opacity: positionReady ? 1 : 0 }}
    >
      <div className="pointer-events-auto flex items-stretch gap-1">
        {/* Combined Segment: BPM + Sync */}
        <div
          className="flex items-center gap-3 pl-4 pr-3 py-2 bg-gray-800/80 backdrop-blur-md border border-gray-700/70 shadow-lg"
          style={{
            borderTopLeftRadius: 30,
            borderBottomLeftRadius: 30,
            borderTopRightRadius: 8,
            borderBottomRightRadius: 8,
          }}
        >
          <div
            aria-label="Beat indicator"
            className={
              "w-2.5 h-2.5 rounded-full transition-all duration-150 " +
              (beatActive ? "bg-purple-500" : "bg-gray-500") +
              (isBarOneBeat && beatActive ? " scale-125 shadow-[0_0_6px_2px_rgba(168,85,247,0.6)]" : "")
            }
          />
          <div className="flex items-center gap-1 text-xs text-gray-300">
            <label htmlFor="global-bpm" className="sr-only">BPM</label>
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
                  ? "border-purple-500/70 ring-2 ring-purple-500/40"
                  : "border-gray-600/70 focus:ring-2 focus:ring-purple-500/60 focus:border-purple-500/60")
              }
            />
            <span className="text-gray-400">BPM</span>
          </div>
          <button
            type="button"
            onClick={() => { audioManager.syncAllNextBeat(); }}
            className="text-xs font-medium px-3 py-1 rounded-md bg-gray-700/70 hover:bg-gray-600 text-gray-100 border border-gray-600/60 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            title="Sync all sequencers to next beat"
          >Sync</button>
        </div>
        {/* Button Segment: Record */}
        <button
          type="button"
          onClick={toggleRecord}
          className={`flex items-center justify-center font-semibold text-xs px-3 py-2 bg-gray-800/80 backdrop-blur-md border border-gray-700/70 shadow-lg transition-colors focus:outline-none focus:ring-2 ${recording ? 'text-white bg-purple-600/90 border-purple-500/70 focus:ring-purple-400/60 animate-pulse' : 'text-gray-100 hover:bg-gray-700/80 focus:ring-purple-500/50'}`}
          style={{
            width: 88, // narrower
            borderRadius: 6,
          }}
          title={recording ? 'Stop recording' : 'Start recording master output'}
        >
          {recording ? `${Math.floor(recordElapsed/60).toString().padStart(2,'0')}:${Math.floor(recordElapsed%60).toString().padStart(2,'0')}` : 'Record'}
        </button>
        {/* Button Segment: Mute */}
        <MuteButton audioManager={audioManager} />
        {/* Button Segment: Panic */}
        <button
          type="button"
          onClick={() => { audioManager.panic(); }}
          className="flex items-center justify-center text-xs font-semibold px-4 py-2 bg-red-900/85 hover:bg-red-600/85 active:bg-red-600 text-white border border-red-800/70 shadow-lg backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-colors"
          style={{
            width: 72,
            borderRadius: 6
          }}
          title="Panic: Send All Notes Off to all synths and clear arps/sequencers"
        >Panic</button>
        {/* Drag Handle Segment */}
        <div
          role="button"
          aria-label="Drag transport"
          title="Drag transport"
          data-handle="transport-drag"
          onPointerDown={onHandlePointerDown}
          className="flex items-center justify-center bg-gray-800/80 backdrop-blur-md border border-gray-700/70 shadow-lg cursor-move select-none active:brightness-110 pointer-events-auto"
          style={{
            width: 40,
            borderTopRightRadius: 30,
            borderBottomRightRadius: 30,
            borderTopLeftRadius: 8,
            borderBottomLeftRadius: 8,
            padding: '0 4px',
            touchAction: 'none'
          }}
        >
          <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true" className="text-gray-400 opacity-70 pointer-events-none">
            <circle cx="3" cy="3" r="1" fill="currentColor" />
            <circle cx="3" cy="8" r="1" fill="currentColor" />
            <circle cx="3" cy="13" r="1" fill="currentColor" />
            <circle cx="11" cy="3" r="1" fill="currentColor" />
            <circle cx="11" cy="8" r="1" fill="currentColor" />
            <circle cx="11" cy="13" r="1" fill="currentColor" />
          </svg>
        </div>
      </div>
    </div>
  <RecordingPreviewModal preview={preview} onClose={()=>{ setPreview(null); }} audioManager={audioManager} />
    </>
  );
}

export default TransportPill;
