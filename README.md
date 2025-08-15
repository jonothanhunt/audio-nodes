<p align="center">
  <img src="./audio-nodes.png" alt="Audio Nodes screenshot" width="640" />
</p>

<h1 align="center">Audio Nodes</h1>

<p align="center">
  <a href="https://nodejs.org/"><img alt="node >=18" src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" /></a>
  <a href="https://www.rust-lang.org/"><img alt="rust stable" src="https://img.shields.io/badge/rust-stable-orange" /></a>
  <a href="https://github.com/rustwasm/wasm-pack"><img alt="wasm-pack" src="https://img.shields.io/badge/wasm--pack-ready-purple" /></a>
  <a href="./LICENSE"><img alt="License MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg" /></a>
</p>

<p align="center"><strong>Modular audio & MIDI playground in the browser.</strong><br/>Rust + WebAssembly DSP core • Next.js UI • React Flow graph</p>

<p align="center"><a href="https://audio-nodes.jonothan.dev">audio-nodes.jonothan.dev</a></p>

## Table of Contents

1. [Introduction](#introduction)
2. [Quick Start](#quick-start)
3. [Project Structure](#project-structure)
4. [Technical Rundown](#technical-rundown)
5. [Authoring a Node](#authoring-a-node)
6. [Troubleshooting](#troubleshooting)
7. [Roadmap & TODO](#roadmap--todo)
8. [Contributing](#contributing)
9. [License](#license)
---

## Introduction

Design synth / effect / MIDI chains visually (e.g. MIDI In → Synth → Reverb → Speaker). Patch cables, tweak parameters, and the low‑latency Rust/WASM engine reacts instantly. All inside your browser – no install besides dependencies.

I love node‑based creative workflows and making music—so this project is a good opportunity for me to learn Rust/WASM while making something fun and useful.

---

## Quick Start

### Prerequisites

- Node.js 18+
- Rust toolchain + wasm-pack

### Install

```bash
git clone <repository-url>
cd audio-nodes
npm install
```

### Build the Audio Engine (WASM)

Compiles the Rust crate and copies wasm-bindgen artifacts into `public/audio-engine-wasm/` (served) and `src/audio-engine-wasm/` (type usage).

```bash
npm run build:wasm
```

### Run

```bash
npm run dev
# then open http://localhost:3000
```

Tip: If the browser blocks autoplay, click anywhere to unlock the AudioContext.

---

## Project Structure

```
audio-nodes/
├── public/
│   ├── worklets/                # AudioWorkletProcessor script
│   ├── audio-engine-wasm/       # Served WASM bundle
│   └── projects/                # Example / default project JSON
├── src/
│   ├── app/                     # Next.js App Router entry
│   ├── components/              # React components (nodes, editor, UI chrome)
│   ├── hooks/                   # Engine, graph, persistence hooks
│   ├── lib/                     # Core managers, registry, helpers
│   ├── types/                   # Shared TypeScript types
│   └── audio-engine-wasm/       # Local copy of wasm-bindgen pkg (types)
├── audio-engine/                # Rust DSP crate (compiled to WASM)
└── build-wasm.sh                # Convenience build + copy script
```

---

## Technical Rundown

### Architecture Overview

Layered for clarity & iteration speed:
- Rust (WASM): Sample‑level DSP (osc, synth voice mgmt, FX). Compiled via wasm-bindgen.
- AudioWorkletProcessor: Owns the instantiated WASM module, executes the per‑block render, routes audio/MIDI, advances the global beat clock, dispatches transport events.
- Main thread (AudioManager): Maintains the declarative graph & param state; serializes diffs to the worklet; exposes subscription helpers.
- React UI: Graph editing (React Flow), parameter panels (auto‑generated from NodeSpec), custom node UIs (sequencer grid, etc.).

### Audio Processing Pipeline
1. User edits graph in React → diff sent to worklet.
2. Worklet resolves a topological order and pulls audio upstream each block.
3. WASM node implementations render into small buffers; results mix/flow downstream.
4. Output written to the worklet's output channels → system audio.

### Transport & Scheduling (Beat‑Only)
- Single global beat clock (no bars / signatures) encourages polymeter & drifting patterns.
- BPM changes, sequencer starts, rate changes & global sync requests are quantized to the next beat boundary for deterministic alignment.
- Sequencers accumulate fractional beats; when threshold reached, they advance a step and emit events (used by UI for visual feedback / grid highlight).

### MIDI & Routing
- Raw MIDI bytes (status, data1, data2) for maximum flexibility.
- Edges are type‑safe: audio↔audio, midi↔midi (no implicit conversions).
- Worklet maintains per‑node MIDI queues processed each render quantum.

### Node Metadata & UI Generation
- Visual/descriptive metadata lives centrally in `nodeRegistry.ts` (no duplication).
- Functional specs (params, IO, help text) live in each node component via a `NodeSpec` object.
- `NodeShell` consumes both to render a consistent layout (handles + param rows + help popover) while allowing custom children for rich UIs.

### Parameters vs Streaming IO
- Parameters: Discrete control events (numbers, bools, selects...) posted only when changed.
- Streaming IO: Continuous audio or MIDI buffers routed every block.
This separation keeps bandwidth low and timing precise.

---

## Authoring a Node

Minimal checklist:
1. Registry: Add display entry (type, name, icon, color, description) to `nodeRegistry.ts`.
2. DSP (if needed): Implement Rust node + export in `audio-engine/src/lib.rs`; rebuild (`npm run build:wasm`).
3. Worklet: Create handling / instantiation logic if it's a new DSP or MIDI processor.
4. UI: Create `src/components/nodes/<Name>Node.tsx` with a `NodeSpec` (params, inputs, outputs, help) and return `<NodeShell spec={spec} />`.
5. Register component in the editor's `nodeTypes` map (unless auto-discovered).
6. Test: Add node, connect cables, wiggle params, confirm console free of load errors.
7. Persistence: Ensure sensible defaults so saved projects reload identically.
8. (Optional) Custom UI: Provide `children` or hooks for grids, previews, advanced controls.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Silence | Ensure a Speaker node is in the chain & receiving audio. |
| Audio won’t start | Click the page (user gesture needed to start AudioContext). |
| WASM 404 / load error | Run `npm run build:wasm` and verify files in `public/audio-engine-wasm/`. Hard refresh. |
| Params not updating | Confirm node type spec keys match what worklet expects; check devtools messages. |
| Timing feels off | Verify BPM change or sequencer start was scheduled before the desired beat (changes quantize to next beat). |

Still stuck? Open an issue with console logs + reproduction steps.

---

## Roadmap & TODO

### Core / DSP
- [ ] Delay (mono / ping‑pong)
- [ ] Filter (standalone multi-mode)
- [ ] Sampler (basic one‑shot / loop)
- [ ] Envelope generator (ADSR) + modulation outputs
- [ ] Chorus / Flanger / Phaser
- [ ] Distortion / Saturation + simple tone shaping
- [ ] EQ (3‑band) & Compressor
- [ ] Offline render / export
- [ ] SIMD exploration / profiling passes

### Modulation & Control
- [ ] LFO enhancements (random, S&H, preview)
- [ ] Per‑destination modulation depth
- [ ] Mod matrix / routing panel

### MIDI / Sequencing
- [ ] Scale quantizer
- [ ] Velocity curve
- [ ] Channel filter
- [ ] Arp pattern variations & direction modes
- [ ] Alternate clock domains / Clock node

### Routing & Utility
- [ ] Gain node
- [ ] Mixer (summing + per‑channel mute/solo)
- [ ] Meter / Analyzer / Scope
- [ ] Splitter / Merger utilities

### Editor / UX
- [ ] Multi‑select improvements (box select refinements)
- [ ] Snap grid toggle & alignment guides
- [ ] Shortcut reference / quick help palette
- [ ] Align / distribute commands
- [ ] Context menu actions (duplicate, isolate, bypass)
- [ ] Project sharing & asset management

### Transport & Timing
- [ ] Dotted / triplet rate multipliers
- [ ] Swing & per‑sequencer quantize options
- [ ] Advanced LFO shapes & per‑destination depth curves

### Documentation
- [ ] Per‑node reference pages
- [ ] Contributing guide
- [ ] Modulation guide
- [ ] Deep dive (engine + scheduling)

### Quality / Maintenance
- [ ] Panic tests & regression checks
- [ ] Ring buffer / allocation audit
- [ ] CI build (lint + type + wasm)

Completed (highlights):
- [x] Rust WASM core (oscillator, poly synth, reverb)
- [x] Beat scheduling & quantized events
- [x] React Flow editor with persistence
- [x] Parameter spec system + centralized registry
- [x] WAV recording, master mute, panic, help popovers

---

## Contributing

PRs and issues welcome. For sizeable DSP or architectural changes, open an issue first outlining intent + rough approach. Keep nodes focused (single responsibility) and prefer extending shared primitives where possible.

---

## License

MIT © 2025 Jonothan Hunt — see [LICENSE](./LICENSE) for full text.

---

<sub>Built for fun, learning, and sonic experiments. Have ideas? Share them!</sub>