"use client";
import React from 'react';
import { NodeShell } from "../../node-framework/NodeShell";
import { NodeSpec } from "../../node-framework/types";
import { useAudioManager } from "../../../lib/AudioManagerContext";

interface ArpeggiatorNodeData {
  playing?: boolean;
  rateMultiplier?: number;
  mode?: string;
  octaves?: number;
  onParameterChange: (nodeId: string, key: string, value: unknown) => void;
  [k: string]: unknown;
}
interface ArpeggiatorNodeProps { id: string; selected?: boolean; data: ArpeggiatorNodeData; }

const MODES = ['up', 'down', 'up-down', 'random', 'chord'] as const;
const RATES = ['0.25', '0.5', '1', '2', '4'] as const; // matches sequencer allowed rates

export const spec: NodeSpec = {
  type: 'arpeggiator',
  // title omitted (registry provides)
  // accentColor & icon centralized in registry
  inputs: [{ id: 'midi-in', role: 'midi-in', label: 'MIDI In' }],
  outputs: [{ id: 'midi-out', role: 'midi-out', label: 'MIDI Out' }],
  params: [
    { key: 'playing', kind: 'bool', default: false, label: 'Play' },
    { key: 'rateMultiplier', kind: 'select', default: '1', label: 'Rate', options: [...RATES] },
    { key: 'mode', kind: 'select', default: 'up', label: 'Mode', options: [...MODES] },
    { key: 'octaves', kind: 'number', default: 1, min: 1, max: 4, step: 1, label: 'Octaves' },
  ],
  help: {
    description: 'Turns held chord notes into a rhythmic pattern. Modes: up, down, up-down (bounce), random, chord (all together). Rate quantized to next beat when changed; start/stop quantized to next beat.',
    inputs: [
      { name: 'MIDI In', description: 'Incoming chord / note input.' },
      { name: 'Play', description: 'Quantized start/stop gate (applies next beat).' },
      { name: 'Rate', description: 'Notes per beat (0.5 = every 2 beats, 2 = twice per beat).' },
      { name: 'Mode', description: 'Traversal order for held notes.' },
      { name: 'Octaves', description: 'Span this many ascending octaves.' }
    ],
    outputs: [{ name: 'MIDI Out', description: 'Arpeggiated note stream.' }]
  },
  // icon centralized in registry
};

export default function ArpeggiatorNode({ id, data, selected }: ArpeggiatorNodeProps) {
  const { onParameterChange } = data;
  const audioManager = useAudioManager();

  // Initialize defaults once
  React.useEffect(() => {
    const ensure = (k: keyof ArpeggiatorNodeData, v: unknown) => { if ((data as Record<string, unknown>)[k as string] == null) onParameterChange(id, k as string, v); };
    ensure('playing', false);
    ensure('rateMultiplier', 1);
    ensure('mode', 'up');
    ensure('octaves', 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playing = !!data.playing;

  const handleParamChange = React.useCallback((nid: string, key: string, value: unknown) => {
    let val: unknown = value;
    if (key === 'rateMultiplier') val = Number(value);
    if (key === 'octaves') val = Math.max(1, Math.min(4, Number(value)));
    onParameterChange(nid, key, val as unknown);
    if (key === 'playing') {
      audioManager.setArpPlay(nid, !!value);
    } else if (key === 'rateMultiplier') {
      audioManager.setArpRate(nid, Number(value));
      setRateHint(true);
      window.setTimeout(() => setRateHint(false), 1400);
    }
  }, [onParameterChange, audioManager]);

  const [rateHint, setRateHint] = React.useState(false);

  const enhancedSpec: NodeSpec = React.useMemo(() => ({
    ...spec,
    renderAfterParams: () => rateHint && playing ? <div className="text-[10px] text-amber-400/80 -mt-1 mb-1">Rate change applies next beat</div> : null
  }), [rateHint, playing]);

  return <NodeShell id={id} data={data as unknown as Record<string, unknown>} spec={enhancedSpec} selected={selected} onParameterChange={handleParamChange} />;
}
