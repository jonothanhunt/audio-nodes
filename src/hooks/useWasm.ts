// src/hooks/useWasm.ts
import { useState, useEffect } from "react";

// Import the actual types from the generated WASM module
type AudioEngineWasm = typeof import("@/audio-engine-wasm/audio_engine");

export default function useWasm() {
  const [wasm, setWasm] = useState<AudioEngineWasm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadWasm() {
      try {
        setLoading(true);
        const wasmModule = await import("@/audio-engine-wasm/audio_engine");
        setWasm(wasmModule);
        console.log("Audio Engine WASM loaded successfully");
      } catch (err) {
        console.error("Failed to load WASM:", err);
        setError(err instanceof Error ? err.message : "Failed to load WASM");
      } finally {
        setLoading(false);
      }
    }
    loadWasm();
  }, []);

  return { wasm, loading, error };
}
