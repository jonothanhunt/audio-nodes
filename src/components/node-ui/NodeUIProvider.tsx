"use client";
import React from 'react';
import { HandleVariant } from './styles/handleStyles';

interface RegistrationMap { [key: string]: HTMLElement | null }
interface TopsMap { [key: string]: number }

interface NodeUIContextValue {
  accentColor: string;
  registerParam: (key: string, el: HTMLElement | null) => void;
  midiEl: (el: HTMLElement | null) => void;
  outputEl: (el: HTMLElement | null) => void;
  paramTops: TopsMap;
  midiTop: number;
  outputTop: number;
  getVariantFor: (key: string) => HandleVariant;
  baseBg: string;
}

const NodeUIContext = React.createContext<NodeUIContextValue | null>(null);

export interface NodeUIProviderProps {
  accentColor: string;
  children: React.ReactNode;
  numericKeys?: string[];
  stringKeys?: string[];
  boolKeys?: string[];
  baseBg?: string;
}

export function NodeUIProvider({ accentColor, children, numericKeys = [], stringKeys = [], boolKeys = [], baseBg = '#111827' }: NodeUIProviderProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const midiRef = React.useRef<HTMLElement | null>(null);
  const outRef = React.useRef<HTMLElement | null>(null);
  const paramRefs = React.useRef<RegistrationMap>({});

  const [midiTop, setMidiTop] = React.useState(0);
  const [outputTop, setOutputTop] = React.useState(0);
  const [paramTops, setParamTops] = React.useState<TopsMap>({});
  const lastParamTopsRef = React.useRef<TopsMap>({});

  const shallowEqual = (a: TopsMap, b: TopsMap) => {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) if (a[k] !== b[k]) return false;
    return true;
  };

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
    const nextMidi = centerFromRoot(midiRef.current);
    const nextOut = centerFromRoot(outRef.current);
    const tops: TopsMap = {};
    Object.keys(paramRefs.current).forEach(k => {
      tops[k] = centerFromRoot(paramRefs.current[k]);
    });
    setMidiTop(prev => prev === nextMidi ? prev : nextMidi);
    setOutputTop(prev => prev === nextOut ? prev : nextOut);
    if (!shallowEqual(lastParamTopsRef.current, tops)) {
      lastParamTopsRef.current = tops;
      setParamTops(tops);
    }
  }, []);

  React.useLayoutEffect(() => {
    compute();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => compute());
      if (rootRef.current) ro.observe(rootRef.current);
      return () => ro.disconnect();
    }
    const onResize = () => compute();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [compute]);

  const scheduleCompute = React.useRef<number | null>(null);
  const requestCompute = React.useCallback(() => {
    if (scheduleCompute.current != null) return;
    scheduleCompute.current = window.requestAnimationFrame(() => {
      scheduleCompute.current = null;
      compute();
    });
  }, [compute]);

  const registerParam = React.useCallback((key: string, el: HTMLElement | null) => {
    if (paramRefs.current[key] === el) return; // no change
    paramRefs.current[key] = el;
    requestCompute();
  }, [requestCompute]);

  const midiEl = React.useCallback((el: HTMLElement | null) => {
    if (midiRef.current === el) return;
    midiRef.current = el;
    requestCompute();
  }, [requestCompute]);

  const outputEl = React.useCallback((el: HTMLElement | null) => {
    if (outRef.current === el) return;
    outRef.current = el;
    requestCompute();
  }, [requestCompute]);

  const value: NodeUIContextValue = React.useMemo(() => ({
    accentColor,
    registerParam,
    midiEl,
    outputEl,
    paramTops,
    midiTop,
    outputTop,
    getVariantFor: (key: string) => {
      if (stringKeys.includes(key)) return 'string';
      if (numericKeys.includes(key)) return 'numeric';
      if (boolKeys.includes(key)) return 'bool';
      return 'midi';
    },
    baseBg
  }), [accentColor, registerParam, midiEl, outputEl, paramTops, midiTop, outputTop, numericKeys, stringKeys, boolKeys, baseBg]);

  return <div ref={rootRef} className="relative"><NodeUIContext.Provider value={value}>{children}</NodeUIContext.Provider></div>;
}

export function useNodeUI() {
  const ctx = React.useContext(NodeUIContext);
  if (!ctx) throw new Error('useNodeUI must be used within NodeUIProvider');
  return ctx;
}
