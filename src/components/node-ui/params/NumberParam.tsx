"use client";
import React from 'react';
import { ParamRow, sharedInputCls } from '../ParamRow';
import { useNodeUI } from '../NodeUIProvider';

interface NumberParamProps {
  nodeId: string;
  paramKey: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  clamp?: boolean;
  onParameterChange: (nodeId: string, parameter: string, value: number) => void;
  useSlider?: boolean; // optional override (auto if min & max)
  badge?: React.ReactNode;
}

export function NumberParam({ nodeId, paramKey, label, value, min, max, step, clamp = true, onParameterChange, useSlider, badge }: NumberParamProps) {
  const { accentColor } = useNodeUI();
  const stop = (e: React.SyntheticEvent) => { e.stopPropagation(); };

  const [raw, setRaw] = React.useState<string>(String(value));
  const lastCommittedRef = React.useRef<number>(value);

  React.useEffect(() => {
    const parsed = parseFloat(raw);
    const rawIsValidNumber = raw.trim() !== '' && !Number.isNaN(parsed);
    if (!rawIsValidNumber || parsed !== value) {
      setRaw(String(value));
      lastCommittedRef.current = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const validateNumber = (n: number) => {
    if (Number.isNaN(n)) return false;
    if (clamp) return true;
    if (min != null && n < min) return false;
    if (max != null && n > max) return false;
    return true;
  };

  const commitValue = (v: number) => {
    if (clamp) {
      if (min != null) v = Math.max(min, v);
      if (max != null) v = Math.min(max, v);
    }
    if (validateNumber(v) && v !== lastCommittedRef.current) {
      lastCommittedRef.current = v;
      onParameterChange(nodeId, paramKey, v);
    }
  };

  const commitIfValid = (rawStr: string) => {
    const trimmed = rawStr.trim();
    if (trimmed === '') return;
    const n = parseFloat(trimmed);
    if (Number.isNaN(n)) return;
    commitValue(n);
  };

  const invalid = raw.trim() === '' || Number.isNaN(parseFloat(raw));
  const showSlider = (useSlider ?? (min != null && max != null));
  const effectiveValue = lastCommittedRef.current;
  const percent = (min != null && max != null) ? ((effectiveValue - min) / (max - min)) * 100 : 0;

  const slider = showSlider && min != null && max != null ? (
    <div className="ml-3 flex items-center gap-1 w-52" onPointerDown={stop} onMouseDown={stop}>
      <span className="text-sm text-white/50 w-6 text-right select-none">{min}</span>
      <div className="relative flex-1 h-7 select-none">
        <div className="absolute inset-0 bg-gray-800 border border-gray-600 rounded flex items-center overflow-hidden">
          <div
            className="h-full transition-[width] duration-75"
            style={{ width: `${percent}%`, background: `linear-gradient(90deg, ${accentColor}, ${accentColor})` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step ?? (max - min) / 100}
          value={effectiveValue}
          onChange={(e) => {
            e.stopPropagation();
            const v = parseFloat(e.target.value);
            commitValue(v);
            setRaw(String(v));
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer nodrag"
        />
      </div>
      <span className="text-sm text-white/50 w-8 text-left select-none">{max}</span>
    </div>
  ) : null;

  return (
    <ParamRow label={label} paramKey={paramKey} badge={badge}>
      <input
        type="number"
        value={raw}
        min={min}
        max={max}
        step={step}
        onChange={e => {
          e.stopPropagation();
          const next = e.target.value;
          setRaw(next);
          commitIfValid(next);
        }}
        onBlur={() => {
          if (raw.trim() === '') {
            setRaw(String(lastCommittedRef.current));
          } else {
            commitIfValid(raw);
            setRaw(String(lastCommittedRef.current));
          }
        }}
        onPointerDown={stop}
        onMouseDown={stop}
        onClick={stop}
        onDoubleClick={stop}
        className={`${sharedInputCls} nodrag ${invalid ? 'border-red-500 focus:border-red-500' : ''}`}
      />
      {slider}
    </ParamRow>
  );
}
