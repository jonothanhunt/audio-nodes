"use client";
import React from "react";
import { NodeSpec } from "./types";
import { useNodeSpec, ParamAuto } from "./useNodeSpec";
import { NodeUIProvider } from "../node-ui/NodeUIProvider";
import { HandleLayer } from "../node-ui/HandleLayer";
import { useNodeUI } from "../node-ui/NodeUIProvider";
import { labelCls } from "../node-ui/styles/inputStyles";
import NodeHelpPopover from "../node-ui/NodeHelpPopover";
import { getNodeMeta } from "@/lib/nodeRegistry";

interface NodeShellProps {
  id: string;
  data: Record<string, unknown>;
  spec: NodeSpec;
  selected?: boolean;
  onParameterChange: (id: string, key: string, value: unknown) => void;
  children?: React.ReactNode;
}

function NodeShellBase(props: NodeShellProps) {
  const { id, data, spec, selected, onParameterChange, children } = props;
  const { params } = useNodeSpec({ id, data, onParameterChange, spec });

  // Derive key groups for styling variants
  const numericKeys = spec.params.filter(p => p.kind === 'number').map(p => p.key);
  const stringKeys = spec.params.filter(p => p.kind === 'text' || p.kind === 'select').map(p => p.key);
  const boolKeys = spec.params.filter(p => p.kind === 'bool').map(p => p.key);


  const primaryIn = spec.inputs?.[0];
  const inVariant: 'audio' | 'midi' | 'numeric' | 'string' | 'bool' = primaryIn?.role.startsWith('midi') ? 'midi' : primaryIn?.role.startsWith('audio') ? 'audio' : 'midi';

  // Helper to determine output variant based on role and params
  const getOutVariant = (role: string): 'audio' | 'midi' | 'numeric' | 'string' | 'bool' => {
    if (role === 'param-out') {
      const firstParam = spec.params.find(p => !p.hidden);
      if (firstParam?.kind === 'bool') return 'bool';
      if (firstParam?.kind === 'text' || firstParam?.kind === 'select') return 'string';
      return 'numeric';
    }
    if (role.startsWith('midi')) return 'midi';
    if (role.startsWith('audio')) return 'audio';
    return 'midi';
  };

  // Use category accent from registry if available
  const registryMeta = getNodeMeta(spec.type);
  const accent = registryMeta.accentColor || spec.accentColor || '#64748b';
  const EffectiveIcon = registryMeta.icon;
  const effectiveTitle = registryMeta.displayName || spec.title || registryMeta.type;

  const [helpOpen, setHelpOpen] = React.useState(false);
  const helpBtnRef = React.useRef<HTMLButtonElement | null>(null);

  return (
    <NodeUIProvider nodeId={id} accentColor={accent} numericKeys={numericKeys} stringKeys={stringKeys} boolKeys={boolKeys}>
      {selected && (
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-gray-500 whitespace-nowrap bg-gray-900/80 px-1 rounded">
          ID: …{id.slice(-8)}
        </div>
      )}
      <div className="relative bg-gray-900 rounded-lg p-4 shadow-lg border" style={{ borderColor: accent }}>
        <div className="pointer-events-none absolute inset-0 rounded-lg" style={{ background: `linear-gradient(135deg, ${accent}26, transparent 65%)` }} />
        <div className="flex items-center gap-2 mb-3 relative">
          {EffectiveIcon && React.createElement(EffectiveIcon, { className: 'w-4 h-4 -translate-y-0.5', style: { color: accent } })}
          <span className="title-font text-base" style={{ color: accent }}>{effectiveTitle}</span>
          {spec.help && (
            <button
              ref={helpBtnRef}
              type="button"
              aria-label="About this node"
              className="nodrag ml-auto inline-flex items-center justify-center w-5 h-5 rounded-full bg-white text-gray-700 text-[11px] font-semibold border border-gray-300 shadow-sm hover:bg-gray-100"
              onClick={(e) => { e.stopPropagation(); setHelpOpen(v => !v); }}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              ?
            </button>
          )}
          {spec.help && helpBtnRef && (
            <NodeHelpPopover
              open={helpOpen}
              onClose={() => setHelpOpen(false)}
              anchorRef={helpBtnRef as React.RefObject<HTMLElement>}
              title={effectiveTitle}
              description={spec.help.description}
              inputs={spec.help.inputs}
              outputs={spec.help.outputs}
            />
          )}
        </div>
        <div className="grid grid-cols-[minmax(16rem,_auto)_auto] gap-x-4">
          <div className="flex flex-col gap-2 col-span-1">
            {primaryIn && <AudioInRow label={primaryIn.label} variant={inVariant} />}
            {spec.renderBeforeParams && spec.renderBeforeParams({ id, data, params, update: (k, v) => onParameterChange(id, k, v) })}
            {params.map(p => (
              <ParamAuto key={p.spec.key} runtime={p} nodeId={id} onParameterChange={onParameterChange} />
            ))}
            {spec.renderAfterParams && spec.renderAfterParams({ id, data, params, update: (k, v) => onParameterChange(id, k, v) })}
          </div>
          {(spec.outputs && spec.outputs.length > 0) && (
            <div className="flex flex-col items-stretch col-span-1 gap-2">
              {spec.outputs.map(out => (
                <AudioOutRow key={out.id} id={out.id} label={out.label} />
              ))}
            </div>
          )}
        </div>
        {/* Full-width custom content (e.g., sequencer grid) */}
        {children && (
          <div className="mt-4">
            {children}
          </div>
        )}
      </div>
      {/* Render the HandleLayer which now queries outputTops */}
      <HandleLayer
        includeMidiIn={!!primaryIn}
        inputHandleVariant={inVariant}
        inputHandleId={primaryIn?.id || 'midi'}
        includeParamTargets={spec.paramHandles !== false}
        outputs={spec.outputs?.map(o => ({ id: o.id, variant: getOutVariant(o.role) }))}
      />
    </NodeUIProvider>
  );
}

export const NodeShell = React.memo(NodeShellBase);

function AudioInRow({ label, variant }: { label: string; variant: string }) {
  const { midiEl } = useNodeUI(); // reuse midi slot for first input alignment
  return (
    <div className="relative flex items-center h-8 mb-1" ref={el => midiEl(el)}>
      <label className={labelCls}>{label}</label>
      <span className="text-xs text-gray-400">Connect {variant === 'audio' ? 'audio' : 'MIDI'}</span>
    </div>
  );
}

function AudioOutRow({ id, label }: { id: string; label: string }) {
  const { registerOutput } = useNodeUI();
  return (
    <div className="relative flex items-center justify-end h-8 mb-1" ref={el => registerOutput(id, el)}>
      <span className="text-xs text-gray-300 mr-2">{label}</span>
    </div>
  );
}
