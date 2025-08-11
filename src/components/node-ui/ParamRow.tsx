"use client";
import React from 'react';
import { labelCls, inputCls } from './styles/inputStyles';
import { useNodeUI } from './NodeUIProvider';

interface ParamRowProps {
  label: string;
  paramKey: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
}

export function ParamRow({ label, paramKey, children, badge }: ParamRowProps) {
  const { registerParam, accentColor } = useNodeUI();
  return (
    <div className="relative flex items-center" ref={el => registerParam(paramKey, el)}>
      <label className={`${labelCls} flex items-center`}>
        <span>{label}</span>
        {badge ? (
          <span
            className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] leading-none select-none"
            style={{ background: `${accentColor}26`, color: '#ffffff' }}
          >
            {badge}
          </span>
        ) : null}
      </label>
      {children}
    </div>
  );
}

export const sharedInputCls = inputCls + ' w-28 text-center';
