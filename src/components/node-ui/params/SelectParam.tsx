"use client";
import React from 'react';
import { ParamRow } from '../ParamRow';
import { inputCls } from '../styles/inputStyles';

interface SelectParamProps {
  nodeId: string;
  paramKey: string;
  label: string;
  value: string;
  options: string[];
  onParameterChange: (nodeId: string, parameter: string, value: string) => void;
  widthClass?: string;
}

export function SelectParam({ nodeId, paramKey, label, value, options, onParameterChange, widthClass = 'w-28' }: SelectParamProps) {
  const stop = (e: React.SyntheticEvent) => { e.stopPropagation(); };
  return (
    <ParamRow label={label} paramKey={paramKey}>
      <select
        value={value}
        onChange={e => { e.stopPropagation(); onParameterChange(nodeId, paramKey, e.target.value); }}
        onPointerDown={stop}
        onMouseDown={stop}
        onClick={stop}
        onDoubleClick={stop}
        className={`${inputCls} ${widthClass} nodrag`}
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </ParamRow>
  );
}
