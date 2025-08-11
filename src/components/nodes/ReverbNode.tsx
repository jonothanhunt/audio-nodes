'use client';

import React from 'react';
import { Handle, Position } from 'reactflow';
import { Waves } from 'lucide-react';
import { getNodeMeta } from '@/lib/nodeRegistry';

interface ReverbNodeProps {
  id: string;
  selected?: boolean;
  data: {
    feedback: number;
    wetMix: number;
    onParameterChange: (nodeId: string, parameter: string, value: string | number) => void;
  };
}

export default function ReverbNode({ id, data, selected }: ReverbNodeProps) {
  const { accentColor } = getNodeMeta('reverb');
  const { feedback, wetMix, onParameterChange } = data;

  // Refs for measured alignment
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const inRef = React.useRef<HTMLDivElement | null>(null);
  const fbRef = React.useRef<HTMLDivElement | null>(null);
  const wetRef = React.useRef<HTMLDivElement | null>(null);
  const outRef = React.useRef<HTMLDivElement | null>(null);

  const [inTop, setInTop] = React.useState(0);
  const [fbTop, setFbTop] = React.useState(0);
  const [wetTop, setWetTop] = React.useState(0);
  const [outTop, setOutTop] = React.useState(0);

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
    setFbTop(centerFromRoot(fbRef.current));
    setWetTop(centerFromRoot(wetRef.current));
    setOutTop(centerFromRoot(outRef.current));
  }, []);

  React.useLayoutEffect(() => {
    compute();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => compute());
      if (rootRef.current) ro.observe(rootRef.current);
      if (cardRef.current) ro.observe(cardRef.current);
      if (inRef.current) ro.observe(inRef.current);
      if (fbRef.current) ro.observe(fbRef.current);
      if (wetRef.current) ro.observe(wetRef.current);
      if (outRef.current) ro.observe(outRef.current);
      return () => ro.disconnect();
    }
    const onResize = () => compute();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [compute]);

  return (
    <div className="relative" ref={rootRef}>
      {/* Floating ID when selected */}
      {selected && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-xs text-gray-500">ID: {id}</div>
      )}

      <div ref={cardRef} className={`relative bg-gray-900 rounded-lg p-4 shadow-lg border`} style={{ borderColor: accentColor, boxShadow: selected ? `0 0 0 1px ${accentColor}, 0 0 12px -2px ${accentColor}` : undefined }}>
        <div className="pointer-events-none absolute inset-0 rounded-lg" style={{ background: `linear-gradient(135deg, ${accentColor}26, transparent 65%)` }} />
        {/* Header full color */}
        <div className="flex items-center gap-2 mb-3 relative">
          <Waves className="w-4 h-4" style={{ color: accentColor }} />
          <span className="title-font font-w-70 text-sm" style={{ color: accentColor }}>Reverb</span>
        </div>

        {/* Two-column grid */}
        <div className="grid grid-cols-[minmax(12rem,_auto)_auto] gap-x-8 gap-y-2">
          {/* Inputs column */}
          <div className="space-y-2">
            {/* Audio In label row */}
            <div ref={inRef} className="relative flex items-center">
              <span className="text-xs text-gray-300">Audio In</span>
            </div>

            {/* Feedback */}
            <div ref={fbRef} className="relative flex items-center">
              <label className="block text-xs text-gray-300 w-20">Feedback</label>
              <input
                type="number"
                value={feedback}
                onChange={(e) => onParameterChange(id, 'feedback', parseFloat(e.target.value))}
                className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white w-24 text-center"
                min="0"
                max="0.95"
                step="0.05"
              />
            </div>

            {/* Wet Mix */}
            <div ref={wetRef} className="relative flex items-center">
              <label className="block text-xs text-gray-300 w-20">Wet Mix</label>
              <input
                type="number"
                value={wetMix}
                onChange={(e) => onParameterChange(id, 'wetMix', parseFloat(e.target.value))}
                className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white w-24 text-center"
                min="0"
                max="1"
                step="0.1"
              />
            </div>
          </div>

          {/* Outputs column */}
          <div className="space-y-2">
            <div ref={outRef} className="relative flex items-center justify-end">
              <span className="text-xs text-gray-300 mr-2">Audio Out</span>
            </div>
          </div>
        </div>
      </div>
      {/* Absolute handles aligned */}
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
        id="feedback"
        className="!w-3 !h-3 !bg-gray-200 !border !border-gray-300 !rounded-none"
        style={{ top: fbTop, transform: 'translateY(-50%) rotate(45deg)', left: -6 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="wetMix"
        className="!w-3 !h-3 !bg-gray-200 !border !border-gray-300 !rounded-none"
        style={{ top: wetTop, transform: 'translateY(-50%) rotate(45deg)', left: -6 }}
      />
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
