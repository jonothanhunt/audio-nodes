"use client";
import React from "react";
import { NodeSpec, ParamRuntime, NumberParamSpec, SelectParamSpec, BoolParamSpec, TextParamSpec } from "./types";
import { useConnectedParamChecker } from "../node-ui/useConnectedParam";

interface UseNodeSpecArgs {
  id: string;
  data: Record<string, unknown>;
  onParameterChange: (id: string, key: string, value: unknown) => void;
  spec: NodeSpec;
}

export function useNodeSpec({ id, data, onParameterChange, spec }: UseNodeSpecArgs) {
  // Ensure defaults once
  React.useEffect(() => {
    spec.params.forEach(p => {
      if (data[p.key] == null) {
        onParameterChange(id, p.key, p.default);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isConnected = useConnectedParamChecker(data);

  const update = React.useCallback((key: string, value: unknown) => {
    onParameterChange(id, key, value);
  }, [id, onParameterChange]);

  const params: ParamRuntime[] = spec.params.filter(p => !p.hidden).map(p => ({
    spec: p,
    value: data[p.key],
    connected: isConnected(p.key),
    set: (v: unknown) => update(p.key, v)
  }));

  return { params, update };
}

// Render a single param automatically
interface ParamAutoProps {
  runtime: ParamRuntime;
  nodeId: string;
  onParameterChange: (nid: string, key: string, value: unknown) => void;
}

import { NumberParam } from "../node-ui/params/NumberParam";
import { BooleanParam } from "../node-ui/params/BooleanParam";
import { SelectParam } from "../node-ui/params/SelectParam";
import { ParamRow } from "../node-ui/ParamRow";
import { inputCls } from "../node-ui/styles/inputStyles";

export function ParamAuto({ runtime, nodeId, onParameterChange }: ParamAutoProps) {
  const { spec, value, connected } = runtime;
  const common = { nodeId, paramKey: spec.key, label: spec.label || prettyLabel(spec.key) };
  switch (spec.kind) {
    case 'number': {
      const s = spec as NumberParamSpec;
      return <NumberParam {...common} value={Number(value ?? s.default)} min={s.min} max={s.max} step={s.step} onParameterChange={onParameterChange as (nid: string, k: string, v: number)=>void} />;
    }
    case 'bool': {
      const s = spec as BoolParamSpec;
      return <BooleanParam {...common} value={Boolean(value ?? s.default)} onParameterChange={onParameterChange as (nid: string, k: string, v: boolean)=>void} />;
    }
    case 'select': {
      const s = spec as SelectParamSpec;
      return <SelectParam {...common} value={String(value ?? s.default)} options={s.options} onParameterChange={onParameterChange as (nid: string, k: string, v: string)=>void} />;
    }
    case 'text': {
      const s = spec as TextParamSpec;
      return (
        <ParamRow label={spec.label || prettyLabel(spec.key)} paramKey={spec.key}>
          <input
            type="text"
            disabled={connected}
            value={String(value ?? s.default)}
            onChange={(e) => {
              if (connected) return;
              onParameterChange(nodeId, spec.key, e.target.value);
            }}
            className={`${inputCls} w-40 nodrag ${connected ? 'opacity-60 cursor-not-allowed' : ''}`}
            style={{ pointerEvents: connected ? 'none' : undefined }}
            placeholder={s.placeholder}
          />
        </ParamRow>
      );
    }
    default:
      return null;
  }
}

function prettyLabel(k: string) {
  return k.charAt(0).toUpperCase() + k.slice(1);
}
