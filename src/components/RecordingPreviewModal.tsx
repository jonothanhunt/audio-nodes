"use client";
import React from "react";
import { inputCls } from "./node-ui/styles/inputStyles";

export interface RecordingPreview {
  url: string;
  dur: number;
  type: string;
}

interface PreviewAudioController { muteForPreview?: () => Promise<void> | void; resumeFromPreview?: () => Promise<void> | void; }
interface RecordingPreviewModalProps {
  preview: RecordingPreview | null;
  onClose: () => void;
  audioManager?: PreviewAudioController; // minimal interface
}

const RecordingPreviewModal: React.FC<RecordingPreviewModalProps> = ({ preview, onClose, audioManager }) => {
  const [fileName, setFileName] = React.useState<string>("");
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [duration, setDuration] = React.useState<number>(0);
  const [current, setCurrent] = React.useState<number>(0);
  const rafRef = React.useRef<number | null>(null);
  const lastUserSeekRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!preview) return;
    const defName = `audio-nodes-${new Date().toISOString().replace(/[:.]/g,'-')}.wav`;
    setFileName((prev)=> prev ? prev : defName);
    // Mute engine while open
    void audioManager?.muteForPreview?.();
    return () => { void audioManager?.resumeFromPreview?.(); };
  }, [preview, audioManager]);

  // Setup RAF loop for progress
  React.useEffect(()=>{
    if (!preview) return;
    const tick = () => {
      const el = audioRef.current;
      if (el) {
        if (el.duration && !isNaN(el.duration) && el.duration !== duration) {
          setDuration(el.duration);
        }
        if (playing) setCurrent(el.currentTime);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return ()=>{ if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [preview, playing, duration]);

  if (!preview) return null;

  const handleCancel = () => {
    try { URL.revokeObjectURL(preview.url); } catch {}
    onClose();
  };
  const handleSave = () => {
    const a = document.createElement('a');
    a.href = preview.url;
    a.download = (fileName || 'recording.wav').trim();
    document.body.appendChild(a); a.click(); a.remove();
    onClose();
  };

  const togglePlay = () => {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().then(()=> setPlaying(true)).catch(()=>{}); }
  };

  const onSeek = (v: number) => { const a = audioRef.current; if (!a) return; a.currentTime = v; setCurrent(v); lastUserSeekRef.current = v; };

  const pct = duration > 0 ? (current / duration) * 100 : 0;
  const timeFmt = (t: number) => {
    if (!isFinite(t)) return '0:00';
    const m = Math.floor(t / 60); const s = Math.floor(t % 60); return `${m}:${s.toString().padStart(2,'0')}`;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[min(480px,90%)] bg-gray-900/95 border border-gray-700/70 rounded-xl shadow-2xl p-6 flex flex-col gap-4 text-gray-100">
        <div className="flex items-start justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-gray-200">Preview &amp; save recording</h2>
          <button onClick={handleCancel} className="text-gray-400 hover:text-gray-200 text-xs px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-purple-500/50" aria-label="Close preview">✕</button>
        </div>
          <div className="flex flex-col gap-5">
          {/* Custom Audio Player */}
          <div className="flex flex-col gap-3 rounded-lg border border-gray-700/70 bg-gray-800/70 backdrop-blur-md px-4 py-3 shadow">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                className={`w-9 h-9 rounded-md flex items-center justify-center bg-gray-900/70 border border-gray-600/70 text-gray-200 hover:bg-gray-800 active:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition-colors`}
                aria-label={playing ? 'Pause playback' : 'Play recording'}
              >
                {playing ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="2" width="4" height="10" rx="1"/><rect x="8" y="2" width="4" height="10" rx="1"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 2.5c0-.55.59-.9 1.07-.63l7.27 3.97c.58.32.58 1.15 0 1.47L4.07 11.28A.75.75 0 0 1 3 10.65V2.5Z"/></svg>
                )}
              </button>
              <div className="flex-1 flex items-center gap-3 select-none">
                <span className="text-[10px] font-mono text-gray-400 w-8 text-right">{timeFmt(current)}</span>
                <div className="relative flex-1 h-7">
                  <div className="absolute inset-0 bg-gray-900 border border-gray-600 rounded flex items-center overflow-hidden">
                    <div
                      className="h-full transition-[width] duration-75"
                      style={{ width: `${pct}%`, background: `linear-gradient(90deg,#7e22ce,#9333ea)` }}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    step={0.01}
                    value={current}
                    onChange={(e)=> onSeek(parseFloat(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    aria-label="Seek"
                  />
                </div>
                <span className="text-[10px] font-mono text-gray-400 w-8">{timeFmt(duration)}</span>
              </div>
            </div>
            <audio
              ref={audioRef}
              src={preview.url}
              preload="auto"
              className="hidden"
              onLoadedMetadata={(e)=>{ const el = e.currentTarget; if (el.duration && isFinite(el.duration)) setDuration(el.duration); }}
              onEnded={()=>{ setPlaying(false); setCurrent(duration); }}
            />
          </div>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-gray-300 tracking-wide pl-0.5">Filename</span>
            <input
              value={fileName}
              onChange={e=>setFileName(e.target.value)}
              className={`${inputCls} h-8 px-2 text-sm w-full`}
              placeholder="recording.wav"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={handleCancel} className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-700/70 hover:bg-gray-600 text-gray-100 border border-gray-600/60 focus:outline-none focus:ring-2 focus:ring-purple-500/40">Cancel</button>
          <button onClick={handleSave} className="px-3 py-1.5 text-xs font-semibold rounded-md bg-purple-600 hover:bg-purple-500 text-white border border-purple-500/70 focus:outline-none focus:ring-2 focus:ring-purple-400/60">Save</button>
        </div>
      </div>
    </div>
  );
};

export default RecordingPreviewModal;
