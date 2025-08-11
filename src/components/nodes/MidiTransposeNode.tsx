"use client";

import React from "react";
import { ArrowUpDown } from "lucide-react";
import { getNodeMeta } from '@/lib/nodeRegistry';
import { NodeUIProvider, useNodeUI } from '../node-ui/NodeUIProvider';
import { HandleLayer } from '../node-ui/HandleLayer';
import { NumberParam } from '../node-ui/params/NumberParam';
import { BooleanParam } from '../node-ui/params/BooleanParam';
import { labelCls } from '../node-ui/styles/inputStyles';

interface MidiTransposeNodeProps {
  id: string;
  selected?: boolean;
  data: {
    semitones?: number;
    clampLow?: number;
    clampHigh?: number;
    passOther?: boolean;
    onParameterChange: (nodeId: string, parameter: string, value: string | number | boolean) => void;
  };
}

const paramConfig = [
  { key: 'semitones', type: 'number', min: -24, max: 24, step: 1, default: 0 },
  { key: 'clampLow', type: 'number', min: 0, max: 127, step: 1, default: 0 },
  { key: 'clampHigh', type: 'number', min: 0, max: 127, step: 1, default: 127 },
  { key: 'passOther', type: 'bool', default: true },
] as const;

type MTKey = typeof paramConfig[number]['key'];

const MidiTransposeNode: React.FC<MidiTransposeNodeProps> = ({ id, data, selected }) => {
  const { accentColor } = getNodeMeta('midi-transpose');
  const { onParameterChange } = data;

  // Ensure defaults once
  React.useEffect(() => {
    paramConfig.forEach(p => {
      const current = (data as Record<string, unknown>)[p.key];
      if (current == null) {
        if (p.type === 'number') onParameterChange(id, p.key, p.default as number);
        else if (p.type === 'bool') onParameterChange(id, p.key, p.default as boolean);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const numericKeys = paramConfig.filter(p => p.type === 'number').map(p => p.key);
  const boolKeys = paramConfig.filter(p => p.type === 'bool').map(p => p.key);

  const getValue = (key: MTKey) => (data as Record<string, unknown>)[key];

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
          <ArrowUpDown className="w-4 h-4" style={{ color: accentColor }} />
          <span className="title-font font-w-70 text-sm" style={{ color: accentColor }}>Transpose</span>
        </div>

        <div className="grid grid-cols-[minmax(16rem,_auto)_auto] gap-y-2 gap-x-4">
          <div className="space-y-2 col-span-1">
            <MidiInRow />
            {paramConfig.map(cfg => {
              const label = cfg.key === 'semitones' ? 'Semitones' : cfg.key === 'clampLow' ? 'Clamp Low' : cfg.key === 'clampHigh' ? 'Clamp High' : 'Pass Other';
              if (cfg.type === 'number') {
                return (
                  <NumberParam
                    key={cfg.key}
                    nodeId={id}
                    paramKey={cfg.key}
                    label={label}
                    value={Number(getValue(cfg.key) ?? cfg.default)}
                    min={cfg.min}
                    max={cfg.max}
                    step={cfg.step}
                    onParameterChange={onParameterChange as (nid: string, param: string, value: number) => void}
                  />
                );
              }
              return (
                <BooleanParam
                  key={cfg.key}
                  nodeId={id}
                  paramKey={cfg.key}
                  label={label}
                  value={Boolean(getValue(cfg.key) ?? cfg.default)}
                  onParameterChange={onParameterChange as (nid: string, param: string, value: boolean) => void}
                />
              );
            })}
          </div>
          <div className="flex flex-col col-span-1">
            <MidiOutRow />
          </div>
        </div>
      </div>
      {/* MIDI input handle id 'midi' (default) and MIDI out id 'midi-out' */}
      <HandleLayer includeMidiIn={true} outputId="midi-out" outputVariant="midi" />
    </NodeUIProvider>
  );
};

function MidiInRow() {
  const { midiEl } = useNodeUI();
  return (
    <div className="relative flex items-center" ref={el => midiEl(el)}>
      <label className={labelCls}>MIDI In</label>
      <span className="text-xs text-gray-400">Connect source</span>
    </div>
  );
}

function MidiOutRow() {
  const { outputEl } = useNodeUI();
  return (
    <div className="relative flex items-center justify-end" ref={el => outputEl(el)}>
      <span className="text-xs text-gray-300 mr-2">MIDI Out</span>
    </div>
  );
}

export default MidiTransposeNode;
