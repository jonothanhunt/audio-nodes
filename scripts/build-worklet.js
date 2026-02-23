#!/usr/bin/env node
/**
 * build-worklet.js — transpile TS worklet → public/worklets/audio-engine-processor.js
 *
 * Uses esbuild to compile the TypeScript source without bundling node_modules
 * (the worklet has no npm imports; it only references ambient types).
 */

import esbuild from "esbuild";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(__filename));

const ENTRY = join(ROOT, "core-audio", "worklet", "audio-engine-processor.ts");
const OUT = join(ROOT, "public", "worklets", "audio-engine-processor.js");

await esbuild.build({
    entryPoints: [ENTRY],
    outfile: OUT,
    bundle: false,       // no npm imports to bundle
    format: "esm",       // ES module output for worklet addModule()
    target: "es2022",    // modern AudioWorklet V8 isolate
    platform: "browser",
    sourcemap: false,
    logLevel: "info",
});

console.log(`✓ Worklet built → ${OUT}`);
