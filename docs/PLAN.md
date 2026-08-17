# Working plan

Live status for the current stretch of work, in the agreed priority order:

1. dependency refresh
2. clicks/pops + performance audit and fixes
3. roadmap features

Sessions may stop mid-stretch (credit limits). This file is the resume point: pick the
first unchecked item under the lowest-numbered incomplete phase. `docs/AUDIO-AUDIT.md`
holds the detailed reasoning behind every phase-2 item, keyed by the same IDs.

---

## Phase 1 — dependency refresh ✅ done

- [x] Next 15.4 → 16.3, React 19.1 → 19.2, lucide-react 0.539 → 1.31
- [x] `reactflow` 11 → `@xyflow/react` 12 (the old package is EOL)
- [x] TypeScript 6.0.3, vitest 4.1, esbuild 0.28, tailwind 4.3, `@types/*`
- [x] wasm-bindgen 0.2.108 → 0.2.127; dropped unused `js-sys`/`web-sys`; release profile
      with fat LTO
- [x] flat ESLint config off the eslintrc bridge; `npm run lint` / `npm run typecheck`
- [x] `npm audit` clean (was 12 findings, 3 critical)
- [x] Turbopack build (dead webpack WASM config removed)
- [x] vitest resolves `@core-audio` and runs `core-audio/**` specs — 50 tests pass, up
      from 14 with a broken suite
- [x] untracked 44 MB of `core-audio/wasm/target`; removed the unused duplicate
      `src/audio-engine-wasm/`; rewrote the broken `build-wasm.sh`

Deliberately **not** taken to latest, with reasons:

| Package | Held at | Why |
|---|---|---|
| `typescript` | 6.0.3 | 7.0.2 typechecks the project clean, but typescript-eslint does not support the TS 7 API yet ([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)). Revisit when it lands. |
| `eslint` | 9.39.5 | `eslint-config-next` 16 bundles `eslint-plugin-react` 7.x, which still calls the `context.getFilename()` API that ESLint 10 removed. Revisit when eslint-plugin-react ships ESLint 10 support. |

---

## Phase 2 — clicks/pops and performance

Ordered by audible impact. IDs match `docs/AUDIO-AUDIT.md`.

### 2a. Click and pop sources ✅ done
- [x] A1 — per-sample smoothed speaker volume/mute (biggest single click)
- [x] A3 — fade nodes in/out on connect/disconnect; defer WASM teardown past the fade
- [x] A4 — stop hard-resetting synth envelope on retrigger; fast-release voice stealing
- [x] A5 — drop `1/voice_count` normalisation for fixed headroom + soft clip
- [x] A2 — master gain via `setTargetAtTime`
- [x] A7 — smooth oscillator amplitude and frequency in Rust
- [x] A8 — smooth reverb wet/feedback in Rust
- [x] A6 — 1.5 ms floor on envelope stage times
- [x] A9 — remove the `startRecording` double-connect (+6 dB and bypasses mute)

### 2b. Render-path correctness
- [x] B1 — per-block render cache; fan-out was rendering a node twice and doubling its
      pitch
- [x] B2 — pooled scratch buffers; nested reverbs were corrupting each other
- [ ] B3 — sample-accurate MIDI (`atFrame` is computed and then ignored). **Next up.**
- [ ] B4 — stereo path and a real reverb topology (defer to the effects roadmap)

### 2c. Audio-thread and message-port cost ✅ done
- [x] C1 — precomputed render plan instead of re-deriving the graph every block
- [x] C2 — reuse param-modulation scratch objects
- [x] C3 — mutate value/logic nodes in place instead of spreading 4× per block
- [x] C4 — batch and throttle `modPreview` to ~30 Hz
- [x] C5 — stop re-pushing every node to the worklet on every drag frame
- [x] C6 — delete the unused `ack*` messages
- [ ] C7 — batch capture blocks while recording (partial; low priority)

### 2d. UI render layer (no visual/UX change)
- [ ] D1 — clear the 16 `react-hooks` 7 warnings, then flip the rules back to `error`
- [ ] D2 — replace the `window` CustomEvent fan-out + `__MOD_PREVIEW_CACHE__` global with
      a per-node subscriber map in `AudioManager`
- [ ] D3 — pass node callbacks through `NodeUIProvider` context instead of rewriting every
      node's `data`

### 2e. Verification
- [x] Regression tests for the render plan, fade envelopes, and fan-out pitch — 76 vitest
      specs (up from 14, one suite of which was erroring) plus 35 native Rust DSP tests.
      `npm run test:all` runs both.
- [ ] Listening check in a browser: the changes are verified by tests and by construction,
      but nobody has actually *heard* them yet. Worth doing before the roadmap work.
- [ ] CI workflow: lint + typecheck + test + wasm build (roadmap "Quality/Maintenance")

#### How phase 2 is tested

`core-audio/worklet/__tests__/harness.ts` loads the **compiled** worklet with stand-ins for
the worklet globals and fake WASM nodes, so the specs drive the code that actually ships
rather than a copy of it. The fake oscillator's sample counter doubles as its phase, which
is what makes the fan-out regression (B1) directly assertable. The Rust side is unit-tested
natively via `crate-type = ["cdylib", "rlib"]`; most of those tests assert a bound on the
maximum sample-to-sample step, which is the measurable form of "does not click".

---

## Phase 3 — roadmap features

Not started. Suggested order once phase 2 is done, cheapest-to-highest-value first —
**to be confirmed before building.** Each one needs a Rust node, a worklet case, a spec
entry, and a UI component (`README.md` → "Authoring a Node").

1. **Gain** — trivial, and the smoothing helper from A1 makes it near-free.
2. **ADSR envelope generator with mod outputs** — unlocks modulating anything with an
   envelope; the synth's envelope code is most of the way there already.
3. **Standalone multi-mode filter** — the most-missed synth building block.
4. **Delay (mono / ping-pong)** — needs the stereo path from B4 to be worth it.
5. **Mixer** (summing + mute/solo) and **Meter / Scope** — both lean on the render cache
   from B1.
6. **Distortion / saturation** — the soft clipper from A5 is reusable here.

Deferred until the above lands: sampler, chorus/flanger/phaser, EQ/compressor, offline
render, mod matrix, scale quantiser, clock node, SIMD exploration.
