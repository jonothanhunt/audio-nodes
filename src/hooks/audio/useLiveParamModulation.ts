// src/hooks/audio/useLiveParamModulation.ts
import React from 'react';

// Hook to subscribe to worklet-sent live param modulation updates.
// Pass `connected = true` to activate tracking (when a param handle is driven externally).
// Returns the live modulated value, or undefined when not connected.
export function useLiveParamModulation(nodeId: string, paramKey: string, connected: boolean) {
  const [value, setValue] = React.useState<number | boolean | undefined>(() => {
    if (!connected || typeof window === 'undefined') return undefined;
    const win = window as unknown as { __MOD_PREVIEW_CACHE__?: Record<string, Record<string, number | boolean>> };
    return win.__MOD_PREVIEW_CACHE__?.[nodeId]?.[paramKey];
  });

  React.useEffect(() => {
    if (!connected) {
      // Clear stale value when disconnected, but if we mount while connected, don't clear the initial load
      setValue(undefined);
      return;
    }
    // Re-synchronize on mount in case the cache updated just before effect ran
    if (typeof window !== 'undefined') {
      const win = window as unknown as { __MOD_PREVIEW_CACHE__?: Record<string, Record<string, number | boolean>> };
      const v = win.__MOD_PREVIEW_CACHE__?.[nodeId]?.[paramKey];
      if (v !== undefined) setValue(v);
    }
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { nodeId: string; data: Record<string, unknown> };
      if (!detail || detail.nodeId !== nodeId) return;
      const v = detail.data?.[paramKey];
      if (typeof v === 'number' && isFinite(v)) setValue(v);
      else if (typeof v === 'boolean') setValue(v);
    };
    window.addEventListener('audioNodesNodeRendered', handler as EventListener);
    return () => window.removeEventListener('audioNodesNodeRendered', handler as EventListener);
  }, [nodeId, paramKey, connected]);
  return value;
}
