'use client';

import React from 'react';
import { Waves } from 'lucide-react';
import { getNodeMeta } from '@/lib/nodeRegistry';
import { NodeUIProvider, useNodeUI } from '../node-ui/NodeUIProvider';
import { HandleLayer } from '../node-ui/HandleLayer';
import { NumberParam } from '../node-ui/params/NumberParam';
import { labelCls } from '../node-ui/styles/inputStyles';

interface ReverbNodeProps {
  id: string;
  selected?: boolean;
  data: {
    feedback?: number;
    wetMix?: number;
    onParameterChange: (nodeId: string, parameter: string, value: string | number) => void;
  };
}

const paramConfig = [
  { key: 'feedback', type: 'number', min: 0, max: 0.95, step: 0.01, default: 0.3 },
  { key: 'wetMix', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
] as const;

type RevParamKey = typeof paramConfig[number]['key'];

export default function ReverbNode({ id, data, selected }: ReverbNodeProps) {
  const { accentColor } = getNodeMeta('reverb');
  const { onParameterChange } = data;

  // Ensure defaults
  React.useEffect(() => {
    paramConfig.forEach(p => {
      const current = (data as Record<string, unknown>)[p.key];
      if (current == null) onParameterChange(id, p.key, p.default);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const numericKeys = paramConfig.filter(p => p.type === 'number').map(p => p.key);
  const getValue = (key: RevParamKey) => (data as Record<string, unknown>)[key];

  return (
    <NodeUIProvider accentColor={accentColor} numericKeys={numericKeys}>
      {selected && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-xs text-gray-500">ID: {id}</div>
      )}
      <div
        className={`relative bg-gray-900 rounded-lg p-4 shadow-lg border`}
        style={{ borderColor: accentColor, boxShadow: selected ? `0 0 0 1px ${accentColor}, 0 0 12px -2px ${accentColor}` : undefined }}
      >
        <div className="pointer-events-none absolute inset-0 rounded-lg" style={{ background: `linear-gradient(135deg, ${accentColor}26, transparent 65%)` }} />

        <div className="flex items-center gap-2 mb-3 relative">
          <Waves className="w-4 h-4" style={{ color: accentColor }} />
          <span className="title-font font-w-70 text-sm" style={{ color: accentColor }}>Reverb</span>
        </div>

        <div className="grid grid-cols-[minmax(16rem,_auto)_auto] gap-y-2 gap-x-4">
          <div className="space-y-2 col-span-1">
            <AudioInRow />
            {paramConfig.map(cfg => (
              <NumberParam
                key={cfg.key}
                nodeId={id}
                paramKey={cfg.key}
                label={cfg.key === 'wetMix' ? 'Wet Mix' : 'Feedback'}
                value={Number(getValue(cfg.key) ?? cfg.default)}
                min={cfg.min}
                max={cfg.max}
                step={cfg.step}
                onParameterChange={onParameterChange as (nid: string, param: string, value: number) => void}
              />
            ))}
          </div>
          <div className="flex flex-col col-span-1">
            <AudioOutRow />
          </div>
        </div>
      </div>
      {/* Audio input handle id 'input' (audio variant) and default 'output' source */}
      <HandleLayer includeMidiIn={true} inputHandleVariant="audio" inputHandleId="input" />
    </NodeUIProvider>
  );
}

function AudioInRow() {
  const { midiEl } = useNodeUI();
  return (
    <div className="relative flex items-center" ref={el => midiEl(el)}>
      <label className={labelCls}>Audio In</label>
      <span className="text-xs text-gray-400">Connect audio</span>
    </div>
  );
}

function AudioOutRow() {
  const { outputEl } = useNodeUI();
  return (
    <div className="relative flex items-center justify-end" ref={el => outputEl(el)}>
      <span className="text-xs text-gray-300 mr-2">Audio Out</span>
    </div>
  );
}
