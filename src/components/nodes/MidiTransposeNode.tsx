"use client";

import React from "react";
import { Handle, Position } from "reactflow";
import { ArrowUpDown } from "lucide-react";

interface MidiTransposeNodeProps {
  id: string;
  selected?: boolean;
  data: {
    semitones?: number;
    clampLow?: number;
    clampHigh?: number;
    passOther?: boolean;
    onParameterChange?: (nodeId: string, parameter: string, value: string | number | boolean) => void;
  };
}

const labelCls = "block text-xs text-gray-300 w-20";
const inputCls = "bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white";

const MidiTransposeNode: React.FC<MidiTransposeNodeProps> = ({ id, data, selected }) => {
  const { onParameterChange } = data;
  const semitones = typeof data.semitones === 'number' ? data.semitones : 0;
  const clampLow = typeof data.clampLow === 'number' ? data.clampLow : 0;
  const clampHigh = typeof data.clampHigh === 'number' ? data.clampHigh : 127;
  const passOther = typeof data.passOther === 'boolean' ? data.passOther : true;

  // alignment refs
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const inRef = React.useRef<HTMLDivElement | null>(null);
  const outRef = React.useRef<HTMLDivElement | null>(null);
  const [inTop, setInTop] = React.useState(0);
  const [outTop, setOutTop] = React.useState(0);

  const compute = React.useCallback(() => {
    const rootEl = rootRef.current as HTMLElement | null;
    if (!rootEl) return;
    const centerFromRoot = (el: HTMLElement | null) => {
      if (!el) return 0; let top = 0; let curr: HTMLElement | null = el;
      while (curr && curr !== rootEl) { top += curr.offsetTop || 0; curr = (curr.offsetParent as HTMLElement) || null; }
      return top + (el.offsetHeight || 0) / 2;
    };
    setInTop(centerFromRoot(inRef.current));
    setOutTop(centerFromRoot(outRef.current));
  }, []);

  React.useLayoutEffect(() => {
    compute();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => compute());
      if (rootRef.current) ro.observe(rootRef.current);
      if (cardRef.current) ro.observe(cardRef.current);
      if (inRef.current) ro.observe(inRef.current);
      if (outRef.current) ro.observe(outRef.current);
      return () => ro.disconnect();
    }
    const onResize = () => compute();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [compute]);

  // Persist defaults once
  React.useEffect(() => {
    const ensure = (k: string, v: string | number | boolean) => onParameterChange?.(id, k, v);
    if (data.semitones == null) ensure('semitones', semitones);
    if (data.clampLow == null) ensure('clampLow', clampLow);
    if (data.clampHigh == null) ensure('clampHigh', clampHigh);
    if (data.passOther == null) ensure('passOther', passOther);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative" ref={rootRef}>
      {selected && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-xs text-gray-500">ID: {id}</div>
      )}
      <div
        ref={cardRef}
        className={`relative bg-gray-900 rounded-lg p-4 shadow-lg border ${selected ? 'border-amber-500' : 'border-amber-500/30'}`}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-transparent rounded-lg" />
        <div className="flex items-center gap-2 mb-3 relative">
          <ArrowUpDown className="w-4 h-4 text-amber-400" />
          <span className="title-font font-w-70 text-amber-400 text-sm">Transpose</span>
        </div>
        {/* Two column layout: left = inputs/params, right = pass other & notes */}
        <div className="grid grid-cols-[minmax(10rem,_auto)_auto] gap-x-8 gap-y-2">
          <div className="space-y-2">
            <div className="relative flex items-center" ref={inRef}>
              <label className={labelCls}>MIDI In</label>
              <div className="text-xs text-gray-400">Connect source</div>
            </div>
            <div className="relative flex items-center">
              <label className={labelCls}>Semitones</label>
              <input
                type="number"
                className={`${inputCls} w-20 text-center`}
                value={semitones}
                min={-24}
                max={24}
                onChange={e => onParameterChange?.(id, 'semitones', Math.max(-24, Math.min(24, Number(e.target.value))))}
              />
            </div>
            <div className="relative flex items-center">
              <label className={labelCls}>Clamp Low</label>
              <input
                type="number"
                className={`${inputCls} w-20 text-center`}
                value={clampLow}
                min={0}
                max={127}
                onChange={e => onParameterChange?.(id, 'clampLow', Math.max(0, Math.min(127, Number(e.target.value))))}
              />
            </div>
            <div className="relative flex items-center">
              <label className={labelCls}>Clamp High</label>
              <input
                type="number"
                className={`${inputCls} w-20 text-center`}
                value={clampHigh}
                min={0}
                max={127}
                onChange={e => onParameterChange?.(id, 'clampHigh', Math.max(0, Math.min(127, Number(e.target.value))))}
              />
            </div>
          </div>
          <div className="space-y-2" ref={outRef}>
            <div className="relative flex items-center">
              <label className={labelCls}>Pass Other</label>
              <input
                type="checkbox"
                className="mr-2"
                checked={passOther}
                onChange={e => onParameterChange?.(id, 'passOther', e.target.checked)}
              />
              <span className="text-xs text-gray-400">Non-notes</span>
            </div>
            <div className="relative flex items-center justify-end">
              <span className="text-xs text-gray-300 mr-2">MIDI Out</span>
            </div>
          </div>
        </div>
      </div>
      <Handle type="target" position={Position.Left} id="midi" className="!w-3 !h-3 !bg-gray-200 !border !border-gray-300 !rounded-none" style={{ top: inTop, transform: 'translateY(-50%)', left: -6 }} />
      <Handle type="source" position={Position.Right} id="midi-out" className="!w-3 !h-3 !bg-gray-200 !border !border-gray-300 !rounded-none" style={{ top: outTop, transform: 'translateY(-50%)', right: -6 }} />
    </div>
  );
};

export default MidiTransposeNode;
