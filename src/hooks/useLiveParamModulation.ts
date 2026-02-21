import React from 'react';

// Hook to subscribe to worklet-sent live param modulation updates.
// Pass `connected = true` to activate tracking (when a param handle is driven externally).
// Returns the live modulated value, or undefined when not connected.
export function useLiveParamModulation(nodeId: string, paramKey: string, connected: boolean) {
  const [value, setValue] = React.useState<number | boolean | undefined>(undefined);
  React.useEffect(() => {
    if (!connected) {
      setValue(undefined); // clear stale value when disconnected
      return;
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
