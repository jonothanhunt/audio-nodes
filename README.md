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
git clone https://github.com/jonothanhunt/audio-nodes.git
# or (SSH)
# git clone git@github.com:jonothanhunt/audio-nodes.git
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
├── core-audio/                  # Unified Audio Domain
│   ├── wasm/                    # Rust DSP crate (compiled to WASM)
│   ├── worklet/                 # AudioWorkletProcessor script & types
│   └── client/                  # Main thread audio managers & registries
├── public/
│   ├── worklets/                # Compiled Worklet (served)
│   └── audio-engine-wasm/       # Compiled WASM bundle (served)
├── src/
│   ├── app/                     # Next.js App Router entry & globals
│   ├── components/
│   │   ├── editor/              # Graph editor UI & framework
│   │   ├── nodes/               # Flattened node components
│   │   └── shared/              # Reusable UI elements
│   ├── hooks/                   # Categorized hooks (audio, editor, state, etc.)
│   └── utils/                   # Generic utility functions
└── scripts/                     # Build & automation scripts (WASM, Worklet)
```

---

## Technical Rundown

### Architecture Overview

The system is organized into a clean separation of concerns:
- **`core-audio/wasm`**: Sample-level DSP in Rust. Performance-critical code that runs inside the AudioWorklet.
- **`core-audio/worklet`**: The interface between Web Audio and WASM. Handles per-block processing, beat scheduling, and param modulations.
- **`core-audio/client`**: High-level state management. Serializes the React Flow graph into instructions for the worklet.
- **`src/components/editor`**: The React Flow integration. Provides the framework for rendering nodes and edges.
- **`src/components/nodes`**: Individual UI definitions for each node type, using `NodeShell` for consistency.

---

## Authoring a Node

Adding a new node involves updating the Rust DSP and the React UI.

### 1. Rust DSP (`core-audio/wasm/`)
- Define node logic in `src/nodes/`.
- Register the node in `src/lib.rs` by adding it to the `AudioNode` enum and `NodeFactory`.

### 2. Audio Client (`core-audio/client/`)
- **Metadata**: Add display info to `nodeRegistry.ts`.
- **Handles**: Define connection roles in `handles.ts`.
- **Types**: (Optional) Add specific data types to `types.ts` if the node has custom state.

### 3. UI Component (`src/components/nodes/`)
- Create a new component using `NodeShell`.
- Define a `NodeSpec` to declare parameters, inputs, and outputs.
- Register the component in `src/components/editor/AudioNodesEditor.tsx` in the `nodeTypes` map.

### 4. Build and Test
- Run `npm run build:wasm` to recompile the Rust core.
- Drag your new node into the editor and verify its parameters and audio output.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Silence | Ensure a Speaker node is in the chain & receiving audio. |
| Audio won’t start | Click the page (user gesture needed to start AudioContext). |
| WASM 404 / load error | Run `npm run build:wasm` and verify files in `public/audio-engine-wasm/`. |
| Missing Handles | Check `core-audio/client/handles.ts` and the component's `NodeSpec`. |

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
- [x] Rust WASM core (oscillator, poly synth, reverb, LFO, MIDI transpose)
- [x] Beat scheduling & quantized events
- [x] React Flow editor with persistence (localStorage + JSON import/export)
- [x] Parameter spec system + centralized registry
- [x] WAV recording, master mute, panic, help popovers
- [x] Param modulation system — value nodes (bool, number, select) and LFO can drive any param-in handle
- [x] Live modulated param preview — disabled controls show real-time worklet values via `useLiveParamModulation`
- [x] Value-node chaining (Bool A → Bool B → sequencer) via `_propagateValueNodes`
- [x] Single-source connection enforcement for MIDI and param handles
- [x] Type-safe `AudioNodeData` covering all node param fields

---

## Contributing

PRs and issues welcome. For sizeable DSP or architectural changes, open an issue first outlining intent + rough approach. Keep nodes focused (single responsibility) and prefer extending shared primitives where possible.

---

## License

MIT © 2025 Jonothan Hunt — see [LICENSE](./LICENSE) for full text.

---

<sub>Built for fun, learning, and sonic experiments. Have ideas? Share them!</sub>