'use client';

import React from 'react';
import { Handle, Position } from 'reactflow';
import { Volume2 } from 'lucide-react';

interface OscillatorNodeProps {
  id: string;
  selected?: boolean;
  data: {
    frequency: number;
    amplitude: number;
    waveform: string;
    onParameterChange: (nodeId: string, parameter: string, value: string | number) => void;
  };
}

const waveforms = [
  { value: 'sine', label: 'Sine' },
  { value: 'square', label: 'Square' },
  { value: 'sawtooth', label: 'Sawtooth' },
  { value: 'triangle', label: 'Triangle' },
];

export default function OscillatorNode({ id, data, selected }: OscillatorNodeProps) {
  const { frequency, amplitude, waveform, onParameterChange } = data;

  // Separate refs: root (react-flow node) and card (inner panel)
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const freqRef = React.useRef<HTMLDivElement | null>(null);
  const ampRef = React.useRef<HTMLDivElement | null>(null);
  const outRef = React.useRef<HTMLDivElement | null>(null);

  const [freqTop, setFreqTop] = React.useState(0);
  const [ampTop, setAmpTop] = React.useState(0);
  const [outTop, setOutTop] = React.useState(0);

  const computeHandlePositions = React.useCallback(() => {
    const rootEl = rootRef.current as HTMLElement | null;
    if (!rootEl) return;

    const centerFromRoot = (el: HTMLElement | null) => {
      if (!el) return 0;
      let top = 0;
      let curr: HTMLElement | null = el;
      // Accumulate offsetTop up to the positioned root
      while (curr && curr !== rootEl) {
        top += curr.offsetTop || 0;
        curr = (curr.offsetParent as HTMLElement) || null;
      }
      return top + (el.offsetHeight || 0) / 2;
    };

    setFreqTop(centerFromRoot(freqRef.current));
    setAmpTop(centerFromRoot(ampRef.current));
    setOutTop(centerFromRoot(outRef.current));
  }, []);

  React.useLayoutEffect(() => {
    computeHandlePositions();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => computeHandlePositions());
      if (rootRef.current) ro.observe(rootRef.current);
      if (cardRef.current) ro.observe(cardRef.current);
      if (freqRef.current) ro.observe(freqRef.current);
      if (ampRef.current) ro.observe(ampRef.current);
      if (outRef.current) ro.observe(outRef.current);
      return () => ro.disconnect();
    }
    const onResize = () => computeHandlePositions();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [computeHandlePositions]);

  React.useEffect(() => {
    computeHandlePositions();
  }, [frequency, amplitude, waveform, computeHandlePositions]);

  return (
    <div className="relative" ref={rootRef}>
      {/* Floating ID shown only when selected */}
      {selected && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-xs text-gray-500">ID: {id}</div>
      )}

      <div
        ref={cardRef}
        className={`relative bg-gray-900 rounded-lg p-4 shadow-lg border ${selected ? 'border-purple-500' : 'border-purple-500/30'}`}
      >
        {/* Subtle gradient from top-left (category tint) */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-500/10 via-purple-500/0 to-transparent rounded-lg" />
        {/* Header with full color */}
        <div className="flex items-center gap-2 mb-3 relative">
          <Volume2 className="w-4 h-4 text-purple-400" />
          <span className="text-purple-400 text-sm font-medium">Oscillator</span>
        </div>

        {/* Grid: inputs (left) | outputs (right) */}
        <div className="grid grid-cols-[minmax(12rem,_auto)_auto] gap-x-8 gap-y-2">
          {/* Inputs column */}
          <div className="space-y-2">
            {/* Frequency row */}
            <div ref={freqRef} className="relative flex items-center">
              <label className="block text-xs text-gray-300 w-20">Frequency</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={frequency}
                  onChange={(e) => onParameterChange(id, 'frequency', parseFloat(e.target.value))}
                  className="bg-gray-800 border-l-4 border-l-gray-600 border border-gray-600 rounded px-2 py-1 text-sm text-white w-24 text-center"
                  min="20"
                  max="2000"
                />
                <span className="text-xs text-gray-400">Hz</span>
              </div>
            </div>

            {/* Amplitude row */}
            <div ref={ampRef} className="relative flex items-center">
              <label className="block text-xs text-gray-300 w-20">Amplitude</label>
              <input
                type="number"
                value={amplitude}
                onChange={(e) => onParameterChange(id, 'amplitude', parseFloat(e.target.value))}
                className="bg-gray-800 border-l-4 border-l-gray-600 border border-gray-600 rounded px-2 py-1 text-sm text-white w-24 text-center"
                min="0"
                max="1"
                step="0.1"
              />
            </div>

            {/* Waveform (no handle) */}
            <div className="relative flex items-center">
              <label className="block text-xs text-gray-300 w-20">Waveform</label>
              <select
                value={waveform}
                onChange={(e) => onParameterChange(id, 'waveform', e.target.value)}
                className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white w-36"
              >
                {waveforms.map((wf) => (
                  <option key={wf.value} value={wf.value}>
                    {wf.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Outputs column */}
          <div className="space-y-2">
            {/* Audio Out row */}
            <div ref={outRef} className="relative flex items-center justify-end">
              <span className="text-xs text-gray-300 mr-2">Audio Out</span>
            </div>
          </div>
        </div>
      </div>

      {/* Absolute handles aligned to measured row centers */}
      {/* Float params = outlined diamond */}
      <Handle
        type="target"
        position={Position.Left}
        id="frequency"
        className="!w-3 !h-3 !bg-gray-200 !border !border-gray-300 !rounded-none"
        style={{ top: freqTop, transform: 'translateY(-50%) rotate(45deg)', left: -6 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="amplitude"
        className="!w-3 !h-3 !bg-gray-200 !border !border-gray-300 !rounded-none"
        style={{ top: ampTop, transform: 'translateY(-50%) rotate(45deg)', left: -6 }}
      />
      {/* Audio = filled circle */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="!w-3 !h-3 !rounded-full !bg-gray-200 !border !border-gray-300"
        style={{ top: outTop, transform: 'translateY(-50%)', right: -6 }}
      />
    </div>
  );
}
