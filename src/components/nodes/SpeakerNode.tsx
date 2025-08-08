'use client';

import React from 'react';
import { Handle, Position } from 'reactflow';
import { Speaker as SpeakerIcon } from 'lucide-react';

interface SpeakerNodeProps {
  id: string;
  selected?: boolean;
  data: {
    volume: number;
    muted: boolean;
    onParameterChange: (nodeId: string, parameter: string, value: string | number | boolean) => void;
  };
}

export default function SpeakerNode({ id, data, selected }: SpeakerNodeProps) {
  const { volume, muted, onParameterChange } = data;

  // Refs for measured alignment
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const inRef = React.useRef<HTMLDivElement | null>(null);
  const volRef = React.useRef<HTMLDivElement | null>(null);

  const [inTop, setInTop] = React.useState(0);
  const [volTop, setVolTop] = React.useState(0);

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
    setInTop(centerFromRoot(inRef.current));
    setVolTop(centerFromRoot(volRef.current));
  }, []);

  React.useLayoutEffect(() => {
    compute();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => compute());
      if (rootRef.current) ro.observe(rootRef.current);
      if (cardRef.current) ro.observe(cardRef.current);
      if (inRef.current) ro.observe(inRef.current);
      if (volRef.current) ro.observe(volRef.current);
      return () => ro.disconnect();
    }
    const onResize = () => compute();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [compute]);

  return (
    <div className="relative" ref={rootRef}>
      {selected && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-xs text-gray-500">ID: {id}</div>
      )}

      <div ref={cardRef} className={`relative bg-gray-900 rounded-lg p-4 shadow-lg border ${selected ? 'border-green-500' : 'border-green-500/30'}`}>
        {/* Subtle top-left gradient (Utility = green) */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-green-500/10 via-green-500/0 to-transparent rounded-lg" />
        {/* Header full color */}
        <div className="flex items-center gap-2 mb-3 relative">
          <SpeakerIcon className="w-4 h-4 text-green-400" />
          <span className="title-font font-w-70 text-green-400 text-sm">Speaker</span>
        </div>

        {/* Two-column grid */}
        <div className="grid grid-cols-[minmax(12rem,_auto)_auto] gap-x-8 gap-y-2">
          {/* Inputs column */}
          <div className="space-y-2">
            {/* Audio In label */}
            <div ref={inRef} className="relative flex items-center">
              <span className="text-xs text-gray-300">Audio In</span>
            </div>

            {/* Volume param */}
            <div ref={volRef} className="relative flex items-center">
              <label className="block text-xs text-gray-300 w-20">Volume</label>
              <input
                type="number"
                value={volume}
                onChange={(e) => onParameterChange(id, 'volume', parseFloat(e.target.value))}
                className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white w-24 text-center"
                min="0"
                max="1"
                step="0.1"
              />
              <label className="flex items-center gap-2 text-xs text-gray-300 ml-3">
                <input
                  type="checkbox"
                  checked={muted}
                  onChange={(e) => onParameterChange(id, 'muted', e.target.checked)}
                  className="bg-gray-800 border border-gray-600 rounded"
                />
                Muted
              </label>
            </div>
          </div>

          {/* Outputs column (speaker has no audio out) */}
          <div />
        </div>
      </div>

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="!w-3 !h-3 !rounded-full !bg-gray-200 !border !border-gray-300"
        style={{ top: inTop, transform: 'translateY(-50%)', left: -6 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="volume"
        className="!w-3 !h-3 !bg-gray-200 !border !border-gray-300 !rounded-none"
        style={{ top: volTop, transform: 'translateY(-50%) rotate(45deg)', left: -6 }}
      />
    </div>
  );
}
