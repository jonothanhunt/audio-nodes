"use client";
import React from "react";
import type { Edge } from "reactflow";

// Maps nodeId → Set of param keys that are driven by an incoming connection.
// Derived from React Flow edges. Pure UI concern — used to disable param inputs.
type ConnectedParamsMap = Map<string, Set<string>>;

const ConnectedParamsContext = React.createContext<ConnectedParamsMap>(new Map());

interface ConnectedParamsProviderProps {
    edges: Edge[];
    children: React.ReactNode;
}

export function ConnectedParamsProvider({ edges, children }: ConnectedParamsProviderProps) {
    const map = React.useMemo<ConnectedParamsMap>(() => {
        const result: ConnectedParamsMap = new Map();
        for (const e of edges) {
            const th = e.targetHandle;
            // Skip non-param handles
            if (!th || ["input", "audio-in", "midi", "midi-in", "midi-out"].includes(th)) continue;
            // Strip optional 'param-' prefix for normalisation
            const key = th.startsWith("param-") ? th.slice(6) : th;
            if (!result.has(e.target)) result.set(e.target, new Set());
            result.get(e.target)!.add(key);
        }
        return result;
    }, [edges]);

    return (
        <ConnectedParamsContext.Provider value={map}>
            {children}
        </ConnectedParamsContext.Provider>
    );
}

export function useConnectedParams(): ConnectedParamsMap {
    return React.useContext(ConnectedParamsContext);
}
