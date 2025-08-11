"use client";

import React from "react";
import { Handle, Position } from "reactflow";
import { Keyboard } from "lucide-react";
import { getNodeMeta } from '@/lib/nodeRegistry';

interface MidiInputNodeProps {
  id: string;
  selected?: boolean;
  data: {
    onParameterChange?: (nodeId: string, parameter: string, value: string | number | boolean) => void;
    onEmitMidi?: (
      sourceId: string,
      events: Array<{ data: [number, number, number]; atFrame?: number; atTimeMs?: number }>
    ) => void;
    deviceId?: string;
    channel?: number | "all";
    status?: string;
    devices?: Array<{ id: string; name: string }>;
    error?: string;
  };
}

const labelCls = "block text-xs text-gray-300 w-20";
const inputCls = "bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white";

const MidiInputNode: React.FC<MidiInputNodeProps> = ({ id, data, selected }) => {
  const { accentColor } = getNodeMeta('midi-input');
  const { onParameterChange, deviceId = "", channel = "all", status, devices = [], error } = data;

  // Refs for handle vertical alignment (like other nodes)
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const outRef = React.useRef<HTMLDivElement | null>(null);
  const [outTop, setOutTop] = React.useState(0);

  const compute = React.useCallback(() => {
    const rootEl = rootRef.current as HTMLElement | null;
    if (!rootEl) return;
    const centerFromRoot = (el: HTMLElement | null) => {
      if (!el) return 0;
      let top = 0; let curr: HTMLElement | null = el;
      while (curr && curr !== rootEl) { top += curr.offsetTop || 0; curr = (curr.offsetParent as HTMLElement) || null; }
      return top + (el.offsetHeight || 0) / 2;
    };
    setOutTop(centerFromRoot(outRef.current));
  }, []);

  React.useLayoutEffect(() => {
    compute();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => compute());
      if (rootRef.current) ro.observe(rootRef.current);
      if (cardRef.current) ro.observe(cardRef.current);
      if (outRef.current) ro.observe(outRef.current);
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
      <div
        ref={cardRef}
        className={`relative bg-gray-900 rounded-lg p-4 shadow-lg border`}
        style={{ borderColor: accentColor, boxShadow: selected ? `0 0 0 1px ${accentColor}, 0 0 12px -2px ${accentColor}` : undefined }}
      >
        <div className="pointer-events-none absolute inset-0 rounded-lg" style={{ background: `linear-gradient(135deg, ${accentColor}26, transparent 65%)` }} />
        {/* Header */}
        <div className="flex items-center gap-2 mb-3 relative">
          <Keyboard className="w-4 h-4" style={{ color: accentColor }} />
            <span className="title-font font-w-70 text-sm" style={{ color: accentColor }}>MIDI In</span>
        </div>

        <div className="space-y-2">
          <div className="relative flex items-center">
            <label className={labelCls}>Device</label>
            <select
              className={`${inputCls} w-40 text-xs`}
              value={deviceId}
              onChange={(e) => onParameterChange?.(id, "deviceId", e.target.value)}
            >
              <option value="">(All)</option>
              {devices.map((d, idx) => {
                const optId = d.id || `dev-${idx}`;
                const label = d.name && d.name.trim().length > 0 ? d.name : (d.id && d.id.trim().length > 0 ? d.id : `Device ${idx + 1}`);
                return (
                  <option key={optId + '-' + idx} value={d.id}>{label}</option>
                );
              })}
            </select>
          </div>
          <div className="relative flex items-center">
            <label className={labelCls}>Channel</label>
            <select
              className={`${inputCls} w-24 text-center`}
              value={channel}
              onChange={(e) =>
                onParameterChange?.(
                  id,
                  "channel",
                  e.target.value === "all" ? "all" : parseInt(e.target.value, 10)
                )
              }
            >
              <option value="all">All</option>
              {Array.from({ length: 16 }).map((_, i) => (
                <option key={i} value={i + 1}>{i + 1}</option>
              ))}
            </select>
          </div>
          {(status || error) && (
            <div className="relative flex items-center" ref={outRef}>
              <label className={labelCls}>Status</label>
              <div className={`text-xs ${error ? 'text-red-400' : 'text-gray-400'} truncate max-w-[7rem]`}>{error || status}</div>
            </div>
          )}
          {!status && !error && (
            <div className="relative flex items-center" ref={outRef}>
              <label className={labelCls}>Status</label>
              <div className="text-xs text-gray-500">idle</div>
            </div>
          )}
        </div>
      </div>

      {/* Right-side MIDI Out handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="midi"
        className="!w-3 !h-3 !bg-gray-200 !border !border-gray-300 !rounded-none"
        style={{ top: outTop, transform: "translateY(-50%)", right: -6 }}
      />
    </div>
  );
};

export default MidiInputNode;
