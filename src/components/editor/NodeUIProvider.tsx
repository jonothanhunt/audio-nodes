"use client";
import React from "react";
import { HandleVariant } from "./styles/handleStyles";
import { useConnectedParamChecker } from "@/hooks/editor/useConnectedParam";

interface RegistrationMap {
    [key: string]: HTMLElement | null;
}
interface TopsMap {
    [key: string]: number;
}

interface NodeUIContextValue {
    accentColor: string;
    registerParam: (key: string, el: HTMLElement | null) => void;
    registerOutput: (id: string, el: HTMLElement | null) => void;
    midiEl: (el: HTMLElement | null) => void;
    paramTops: TopsMap;
    outputTops: TopsMap;
    midiTop: number;
    getVariantFor: (key: string) => HandleVariant;
    baseBg: string;
    isParamConnected: (key: string) => boolean;
    nodeId: string;
}

const NodeUIContext = React.createContext<NodeUIContextValue | null>(null);

export interface NodeUIProviderProps {
    nodeId: string;
    accentColor: string;
    children: React.ReactNode;
    numericKeys?: string[];
    stringKeys?: string[];
    boolKeys?: string[];
    baseBg?: string;
}

export function NodeUIProvider({
    nodeId,
    accentColor,
    children,
    numericKeys = [],
    stringKeys = [],
    boolKeys = [],
    baseBg = "#111827",
}: NodeUIProviderProps) {
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const midiRef = React.useRef<HTMLElement | null>(null);
    const paramRefs = React.useRef<RegistrationMap>({});
    const outputRefs = React.useRef<RegistrationMap>({});

    const [midiTop, setMidiTop] = React.useState(0);
    const [paramTops, setParamTops] = React.useState<TopsMap>({});
    const [outputTops, setOutputTops] = React.useState<TopsMap>({});
    const lastParamTopsRef = React.useRef<TopsMap>({});
    const lastOutputTopsRef = React.useRef<TopsMap>({});

    // Derive isParamConnected from ConnectedParamsContext (single source of truth)
    const isParamConnected = useConnectedParamChecker(nodeId);

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
        const pTops: TopsMap = {};
        Object.keys(paramRefs.current).forEach((k) => {
            pTops[k] = centerFromRoot(paramRefs.current[k]);
        });
        const oTops: TopsMap = {};
        Object.keys(outputRefs.current).forEach((k) => {
            oTops[k] = centerFromRoot(outputRefs.current[k]);
        });

        setMidiTop((prev) => (prev === nextMidi ? prev : nextMidi));

        if (!shallowEqual(lastParamTopsRef.current, pTops)) {
            lastParamTopsRef.current = pTops;
            setParamTops(pTops);
        }
        if (!shallowEqual(lastOutputTopsRef.current, oTops)) {
            lastOutputTopsRef.current = oTops;
            setOutputTops(oTops);
        }
    }, []);

    React.useLayoutEffect(() => {
        compute();
        if (typeof ResizeObserver !== "undefined") {
            const ro = new ResizeObserver(() => compute());
            if (rootRef.current) ro.observe(rootRef.current);
            return () => ro.disconnect();
        }
        const onResize = () => compute();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [compute]);

    const scheduleCompute = React.useRef<number | null>(null);
    const requestCompute = React.useCallback(() => {
        if (scheduleCompute.current != null) return;
        scheduleCompute.current = window.requestAnimationFrame(() => {
            scheduleCompute.current = null;
            compute();
        });
    }, [compute]);

    const registerParam = React.useCallback(
        (key: string, el: HTMLElement | null) => {
            if (paramRefs.current[key] === el) return;
            paramRefs.current[key] = el;
            requestCompute();
        },
        [requestCompute],
    );

    const midiEl = React.useCallback(
        (el: HTMLElement | null) => {
            if (midiRef.current === el) return;
            midiRef.current = el;
            requestCompute();
        },
        [requestCompute],
    );

    const registerOutput = React.useCallback(
        (id: string, el: HTMLElement | null) => {
            if (outputRefs.current[id] === el) return;
            outputRefs.current[id] = el;
            requestCompute();
        },
        [requestCompute],
    );

    const value: NodeUIContextValue = React.useMemo(
        () => ({
            accentColor,
            registerParam,
            registerOutput,
            midiEl,
            paramTops,
            outputTops,
            midiTop,
            getVariantFor: (key: string) => {
                if (stringKeys.includes(key)) return "string";
                if (numericKeys.includes(key)) return "numeric";
                if (boolKeys.includes(key)) return "bool";
                return "midi";
            },
            baseBg,
            isParamConnected,
            nodeId,
        }),
        [
            accentColor,
            registerParam,
            registerOutput,
            midiEl,
            paramTops,
            outputTops,
            midiTop,
            numericKeys,
            stringKeys,
            boolKeys,
            baseBg,
            isParamConnected,
            nodeId,
        ],
    );

    return (
        <div ref={rootRef} className="relative h-full w-full">
            <NodeUIContext.Provider value={value}>
                {children}
            </NodeUIContext.Provider>
        </div>
    );
}

export function useNodeUI() {
    const ctx = React.useContext(NodeUIContext);
    if (!ctx) throw new Error("useNodeUI must be used within NodeUIProvider");
    return ctx;
}
