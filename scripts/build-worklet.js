#!/usr/bin/env node
/**
 * scripts/build-worklet.js
 *
 * Concatenates worklet source modules in order and writes the final
 * audio-engine-processor.js into public/worklets/.
 *
 * Source files live in public/worklets/src/.
 * Each file is a self-contained segment that assumes it runs in a single
 * AudioWorkletProcessor class scope when concatenated.
 *
 * To split the processor further:
 *   1. Cut a section from audio-engine-processor.src.js
 *   2. Save it as public/worklets/src/<section>.js
 *   3. Add its name to MODULE_ORDER below
 *   4. Run `npm run build:worklet`
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC_DIR = join(ROOT, "public", "worklets", "src");
const OUT_FILE = join(ROOT, "public", "worklets", "audio-engine-processor.js");
const SINGLE_SRC = join(ROOT, "public", "worklets", "audio-engine-processor.src.js");

/**
 * List source module filenames in dependency order.
 * Leave empty to use the single-file source (SINGLE_SRC).
 */
const MODULE_ORDER = [
    // e.g., "header.js", "messaging.js", "modulation.js", "audio.js", "footer.js"
];

function buildFromModules() {
    const parts = MODULE_ORDER.map((name) => {
        const path = join(SRC_DIR, name);
        if (!existsSync(path)) throw new Error(`Module not found: ${path}`);
        return `// === ${name} ===\n${readFileSync(path, "utf8")}`;
    });
    return parts.join("\n\n");
}

function buildFromSingleSrc() {
    if (!existsSync(SINGLE_SRC)) throw new Error(`Single source not found: ${SINGLE_SRC}`);
    return readFileSync(SINGLE_SRC, "utf8");
}

const output = MODULE_ORDER.length > 0 ? buildFromModules() : buildFromSingleSrc();

writeFileSync(OUT_FILE, output, "utf8");
console.log(`✓ Worklet built → ${OUT_FILE} (${Math.round(output.length / 1024)}KB)`);
