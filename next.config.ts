import type { NextConfig } from "next";

/**
 * The Rust/WASM audio engine is never imported through the bundler — the
 * AudioWorklet fetches `public/audio-engine-wasm/*` at runtime and evaluates the
 * wasm-bindgen glue inside the worklet isolate (see `core-audio/client/audioManager.ts`
 * → `bootstrapWasmToWorklet`). So no `asyncWebAssembly` bundler config is needed,
 * which keeps us on the default Turbopack pipeline in Next 16.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
