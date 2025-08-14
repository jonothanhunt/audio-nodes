import React from 'react';
// import { useAudioEngine } from '@/hooks/useAudioEngine';

// Hook to subscribe to worklet-sent live param modulation updates
export function useLiveParamModulation(nodeId: string, paramKey: string, disabled: boolean) {
  const [value, setValue] = React.useState<number | undefined>(undefined);
  React.useEffect(()=>{
    if (disabled) return; // only track when disabled due to modulation
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { nodeId: string; data: Record<string, unknown> };
      if (!detail || detail.nodeId !== nodeId) return;
      const v = detail.data?.[paramKey];
      if (typeof v === 'number') setValue(v);
    };
    window.addEventListener('audioNodesNodeRendered', handler as EventListener);
    return ()=> window.removeEventListener('audioNodesNodeRendered', handler as EventListener);
  }, [nodeId, paramKey, disabled]);
  return value;
}
