"use client";

import React from "react";
import { Handle, Position } from "reactflow";
import { Volume2 } from "lucide-react";

interface SynthNodeProps {
  id: string;
  selected?: boolean;
  data: {
    // params
    preset?: string;
    waveform?: "sine" | "square" | "sawtooth" | "triangle" | string;
    attack?: number;
    decay?: number;
    sustain?: number;
    release?: number;
    cutoff?: number;
    resonance?: number;
    glide?: number;
    gain?: number;
    maxVoices?: number;
    onParameterChange: (
      nodeId: string,
      parameter: string,
      value: string | number | boolean
    ) => void;
  };
}

export default function SynthesizerNode({ id, data, selected }: SynthNodeProps) {
  const { onParameterChange } = data;

  // Defaults
  const preset = data.preset ?? "Init";
  const waveform = (data.waveform as string) ?? "sawtooth";
  const attack = Number.isFinite(Number(data.attack)) ? Number(data.attack) : 0.005;
  const decay = Number.isFinite(Number(data.decay)) ? Number(data.decay) : 0.12;
  const sustain = Number.isFinite(Number(data.sustain)) ? Number(data.sustain) : 0.7;
  const release = Number.isFinite(Number(data.release)) ? Number(data.release) : 0.12;
  const cutoff = Number.isFinite(Number(data.cutoff)) ? Number(data.cutoff) : 10000;
  const resonance = Number.isFinite(Number(data.resonance)) ? Number(data.resonance) : 0.2;
  const glide = Number.isFinite(Number(data.glide)) ? Number(data.glide) : 0;
  const gain = Number.isFinite(Number(data.gain)) ? Number(data.gain) : 0.5;
  const maxVoices = Number.isFinite(Number(data.maxVoices)) ? Number(data.maxVoices) : 8;

  // Persist defaults if missing
  React.useEffect(() => {
    const ensure = (k: string, v: string | number | boolean) => onParameterChange(id, k, v);
    if (data.preset == null) ensure("preset", preset);
    if (data.waveform == null) ensure("waveform", waveform);
    if (data.attack == null) ensure("attack", attack);
    if (data.decay == null) ensure("decay", decay);
    if (data.sustain == null) ensure("sustain", sustain);
    if (data.release == null) ensure("release", release);
    if (data.cutoff == null) ensure("cutoff", cutoff);
    if (data.resonance == null) ensure("resonance", resonance);
    if (data.glide == null) ensure("glide", glide);
    if (data.gain == null) ensure("gain", gain);
    if (data.maxVoices == null) ensure("maxVoices", maxVoices);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // handle alignment
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const midiRef = React.useRef<HTMLDivElement | null>(null);
  const outRef = React.useRef<HTMLDivElement | null>(null);
  const paramRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const [midiTop, setMidiTop] = React.useState(0);
  const [outTop, setOutTop] = React.useState(0);
  const [paramTops, setParamTops] = React.useState<Record<string, number>>({});

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
    setMidiTop(centerFromRoot(midiRef.current));
    setOutTop(centerFromRoot(outRef.current));
    const tops: Record<string, number> = {};
    Object.keys(paramRefs.current).forEach((k) => {
      tops[k] = centerFromRoot(paramRefs.current[k]);
    });
    setParamTops(tops);
  }, []);

  React.useLayoutEffect(() => {
    compute();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => compute());
      if (rootRef.current) ro.observe(rootRef.current);
      if (cardRef.current) ro.observe(cardRef.current);
      if (midiRef.current) ro.observe(midiRef.current);
      if (outRef.current) ro.observe(outRef.current);
      return () => ro.disconnect();
    }
    const onResize = () => compute();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [compute]);

  const labelCls = "block text-xs text-gray-300 w-24";
  const inputCls = "bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white";

  return (
    <div className="relative" ref={rootRef}>
      {selected && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-xs text-gray-500">ID: {id}</div>
      )}

      <div
        ref={cardRef}
        className={`relative bg-gray-900 rounded-lg p-4 shadow-lg border ${
          selected ? "border-purple-500" : "border-purple-500/30"
        }`}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-500/10 via-purple-500/0 to-transparent rounded-lg" />

        <div className="flex items-center gap-2 mb-3 relative">
          <Volume2 className="w-4 h-4 text-purple-400" />
          <span className="title-font font-w-70 text-purple-400 text-sm">Synth</span>
        </div>

        <div className="grid grid-cols-[minmax(16rem,_auto)] gap-y-2">
          {/* One vertical column of controls */}
          <div className="space-y-2">
            <div className="relative flex items-center" ref={midiRef}>
              <label className={labelCls}>MIDI In</label>
              <span className="text-xs text-gray-400">Connect a sequencer or MIDI In</span>
            </div>

            <div className="relative flex items-center" ref={(el) => { paramRefs.current.preset = el; }}>
              <label className={labelCls}>Preset</label>
              <select
                value={preset}
                onChange={(e) => onParameterChange(id, "preset", e.target.value)}
                className={`${inputCls} w-28`}
              >
                <option>Init</option>
                <option>Pluck</option>
                <option>Pad</option>
                <option>Bass</option>
              </select>
            </div>

            <div className="relative flex items-center" ref={(el) => { paramRefs.current.waveform = el; }}>
              <label className={labelCls}>Waveform</label>
              <select
                value={waveform}
                onChange={(e) => onParameterChange(id, "waveform", e.target.value)}
                className={`${inputCls} w-28`}
              >
                <option value="sine">Sine</option>
                <option value="sawtooth">Saw</option>
                <option value="square">Square</option>
                <option value="triangle">Triangle</option>
              </select>
            </div>

            <div className="relative flex items-center" ref={(el) => { paramRefs.current.attack = el; }}>
              <label className={labelCls}>Attack</label>
              <input
                type="number"
                value={attack}
                min={0}
                step={0.001}
                onChange={(e) => onParameterChange(id, "attack", Math.max(0, Number(e.target.value)))}
                className={`${inputCls} w-24 text-center`}
              />
            </div>
            <div className="relative flex items-center" ref={(el) => { paramRefs.current.decay = el; }}>
              <label className={labelCls}>Decay</label>
              <input
                type="number"
                value={decay}
                min={0}
                step={0.001}
                onChange={(e) => onParameterChange(id, "decay", Math.max(0, Number(e.target.value)))}
                className={`${inputCls} w-24 text-center`}
              />
            </div>
            <div className="relative flex items-center" ref={(el) => { paramRefs.current.sustain = el; }}>
              <label className={labelCls}>Sustain</label>
              <input
                type="number"
                value={sustain}
                min={0}
                max={1}
                step={0.01}
                onChange={(e) => onParameterChange(id, "sustain", Math.max(0, Math.min(1, Number(e.target.value))))}
                className={`${inputCls} w-24 text-center`}
              />
            </div>
            <div className="relative flex items-center" ref={(el) => { paramRefs.current.release = el; }}>
              <label className={labelCls}>Release</label>
              <input
                type="number"
                value={release}
                min={0}
                step={0.001}
                onChange={(e) => onParameterChange(id, "release", Math.max(0, Number(e.target.value)))}
                className={`${inputCls} w-24 text-center`}
              />
            </div>

            <div className="relative flex items-center" ref={(el) => { paramRefs.current.cutoff = el; }}>
              <label className={labelCls}>Cutoff</label>
              <input
                type="number"
                value={cutoff}
                min={20}
                max={20000}
                step={1}
                onChange={(e) => onParameterChange(id, "cutoff", Math.max(20, Math.min(20000, Number(e.target.value))))}
                className={`${inputCls} w-24 text-center`}
              />
            </div>
            <div className="relative flex items-center" ref={(el) => { paramRefs.current.resonance = el; }}>
              <label className={labelCls}>Resonance</label>
              <input
                type="number"
                value={resonance}
                min={0}
                max={1}
                step={0.01}
                onChange={(e) => onParameterChange(id, "resonance", Math.max(0, Math.min(1, Number(e.target.value))))}
                className={`${inputCls} w-24 text-center`}
              />
            </div>
            <div className="relative flex items-center" ref={(el) => { paramRefs.current.glide = el; }}>
              <label className={labelCls}>Glide</label>
              <input
                type="number"
                value={glide}
                min={0}
                step={1}
                onChange={(e) => onParameterChange(id, "glide", Math.max(0, Number(e.target.value)))}
                className={`${inputCls} w-24 text-center`}
              />
            </div>
            <div className="relative flex items-center" ref={(el) => { paramRefs.current.gain = el; }}>
              <label className={labelCls}>Gain</label>
              <input
                type="number"
                value={gain}
                min={0}
                max={1}
                step={0.01}
                onChange={(e) => onParameterChange(id, "gain", Math.max(0, Math.min(1, Number(e.target.value))))}
                className={`${inputCls} w-24 text-center`}
              />
            </div>
            <div className="relative flex items-center" ref={(el) => { paramRefs.current.maxVoices = el; }}>
              <label className={labelCls}>Voices</label>
              <input
                type="number"
                value={maxVoices}
                min={1}
                max={32}
                step={1}
                onChange={(e) => onParameterChange(id, "maxVoices", Math.max(1, Math.min(32, Number(e.target.value))))}
                className={`${inputCls} w-24 text-center`}
              />
            </div>

            <div className="relative flex items-center justify-end" ref={outRef}>
              <span className="text-xs text-gray-300 mr-2">Audio Out</span>
            </div>
          </div>
        </div>
      </div>

      {/* Left-side target handles for all params */}
      <Handle
        type="target"
        position={Position.Left}
        id="midi"
        className="!w-3 !h-3 !bg-gray-200 !border !border-gray-300 !rounded-none"
        style={{ top: midiTop, transform: "translateY(-50%)", left: -6 }}
      />
      {Object.entries(paramTops).map(([idKey, top]) => {
        const isNumeric = [
          'attack','decay','sustain','release','cutoff','resonance','glide','gain','maxVoices'
        ].includes(idKey);
        return (
          <Handle
            key={idKey}
            type="target"
            position={Position.Left}
            id={idKey}
            className="!w-3 !h-3 !bg-gray-200 !border !border-gray-300 !rounded-none"
            style={{ top, left: -6, transform: `translateY(-50%)${isNumeric ? ' rotate(45deg)' : ''}` }}
          />
        );
      })}

      {/* Right-side output: audio = circle */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="!w-3 !h-3 !bg-gray-200 !border !border-gray-300"
        style={{ top: outTop, transform: "translateY(-50%)", right: -6, borderRadius: "9999px" }}
      />
    </div>
  );
}
