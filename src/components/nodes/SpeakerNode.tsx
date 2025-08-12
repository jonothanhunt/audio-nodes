'use client';

import React from 'react';
import { Speaker as SpeakerIcon } from 'lucide-react';
import { getNodeMeta } from '@/lib/nodeRegistry';
import { NodeUIProvider, useNodeUI } from '../node-ui/NodeUIProvider';
import { HandleLayer } from '../node-ui/HandleLayer';
import { NumberParam } from '../node-ui/params/NumberParam';
import { BooleanParam } from '../node-ui/params/BooleanParam';
import { labelCls } from '../node-ui/styles/inputStyles';
import NodeHelpPopover, { HelpItem } from '../node-ui/NodeHelpPopover';

interface SpeakerNodeProps {
  id: string;
  selected?: boolean;
  data: {
    volume?: number; // default 0.8
    muted?: boolean; // default false
    onParameterChange: (nodeId: string, parameter: string, value: string | number | boolean) => void;
  };
}

const paramConfig = [
  { key: 'volume', type: 'number', min: 0, max: 1, step: 0.01, default: 0.8 },
  { key: 'muted', type: 'bool', default: false }
] as const;

type SpeakerParamKey = typeof paramConfig[number]['key'];

export default function SpeakerNode({ id, data, selected }: SpeakerNodeProps) {
  const { accentColor } = getNodeMeta('speaker');
  const { onParameterChange } = data;
  const [helpOpen, setHelpOpen] = React.useState(false);
  const helpBtnRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    paramConfig.forEach(p => {
      const current = (data as Record<string, unknown>)[p.key];
      if (current == null) {
        if (p.type === 'number') onParameterChange(id, p.key, p.default);
        else if (p.type === 'bool') onParameterChange(id, p.key, p.default);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const numericKeys = paramConfig.filter(p => p.type === 'number').map(p => p.key);
  const boolKeys = paramConfig.filter(p => p.type === 'bool').map(p => p.key);

  const getValue = (key: SpeakerParamKey) => (data as Record<string, unknown>)[key];

  return (
    <NodeUIProvider accentColor={accentColor} numericKeys={numericKeys} boolKeys={boolKeys}>
      {selected && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-xs text-gray-500">ID: {id}</div>
      )}
      <div
        className={`relative bg-gray-900 rounded-lg p-4 shadow-lg border`}
        style={{ borderColor: accentColor, boxShadow: selected ? `0 0 0 1px ${accentColor}, 0 0 12px -2px ${accentColor}` : undefined }}
      >
        <div className="pointer-events-none absolute inset-0 rounded-lg" style={{ background: `linear-gradient(135deg, ${accentColor}26, transparent 65%)` }} />

        <div className="flex items-center gap-2 mb-3 relative">
          <SpeakerIcon className="w-4 h-4 -translate-y-0.5" style={{ color: accentColor }} />
          <span className="title-font text-base" style={{ color: accentColor }}>Speaker</span>
          <div className="ml-auto flex items-center">
            <button
              ref={helpBtnRef}
              type="button"
              aria-label="About this node"
              className="nodrag inline-flex items-center justify-center w-5 h-5 rounded-full bg-white text-gray-700 text-[11px] font-semibold border border-gray-300 shadow-sm hover:bg-gray-100"
              onClick={(e) => { e.stopPropagation(); setHelpOpen(v => !v); }}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              ?
            </button>
          </div>
        </div>

        <NodeHelpPopover
          open={helpOpen}
          onClose={() => setHelpOpen(false)}
          anchorRef={helpBtnRef as React.RefObject<HTMLElement>}
          title="Speaker"
          description="Final output node. Controls volume and mute."
          inputs={[
            { name: 'Audio In', description: 'Audio signal input to be played.' },
            { name: 'Volume', description: 'Output level (0–1).' },
            { name: 'Muted', description: 'Toggle output.' },
          ] as HelpItem[]}
          outputs={[]}
        />

        {/* Speaker has only inputs, so we can use a single column. */}
        <div className="space-y-2">
          <AudioInRow />
          {paramConfig.map(cfg => {
            const pretty = cfg.key.charAt(0).toUpperCase() + cfg.key.slice(1);
            if (cfg.type === 'number') {
              return (
                <NumberParam
                  key={cfg.key}
                  nodeId={id}
                  paramKey={cfg.key}
                  label={pretty}
                  value={Number(getValue(cfg.key) ?? cfg.default)}
                  min={cfg.min}
                  max={cfg.max}
                  step={cfg.step}
                  onParameterChange={onParameterChange as (nid: string, param: string, value: number) => void}
                />
              );
            }
            if (cfg.type === 'bool') {
              return (
                <BooleanParam
                  key={cfg.key}
                  nodeId={id}
                  paramKey={cfg.key}
                  label={pretty}
                  value={Boolean(getValue(cfg.key) ?? cfg.default)}
                  onParameterChange={onParameterChange as (nid: string, param: string, value: boolean) => void}
                />
              );
            }
            return null;
          })}
        </div>
      </div>
      {/* Audio input handle with id 'input' */}
      <HandleLayer includeMidiIn={true} inputHandleVariant="audio" inputHandleId="input" outputId={null} />
    </NodeUIProvider>
  );
}

function AudioInRow() {
  const { midiEl } = useNodeUI(); // reuse midi slot for audio in alignment (single column)
  return (
    <div className="relative flex items-center" ref={el => midiEl(el)}>
      <label className={labelCls}>Audio In</label>
      <span className="text-xs text-gray-400">Connect audio</span>
    </div>
  );
}
