// src/hooks/useWasm.ts
// Deprecated: WASM loads inside the AudioWorklet now. This hook is no longer used.
export default function useWasm() {
  return { wasm: null, loading: false, error: null } as const;
}
