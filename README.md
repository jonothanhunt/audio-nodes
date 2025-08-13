# Audio Nodes

[![node >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![rust stable](https://img.shields.io/badge/rust-stable-orange)](https://www.rust-lang.org/)
[![wasm-pack](https://img.shields.io/badge/wasm--pack-ready-purple)](https://github.com/rustwasm/wasm-pack)

A visual audio playground where you build sound by connecting blocks (nodes). It runs in your browser. Under the hood, the sound engine is written in [Rust](https://www.rust-lang.org/) and compiled to [WebAssembly (WASM)](https://webassembly.org/) for speed; the UI is built with [Next.js](https://nextjs.org/) ([React](https://react.dev/)) and [React Flow](https://reactflow.dev).

Live site: https://audio-nodes.jonothan.dev

I love node‑based creative workflows and making music—so this project is a good opportunity to learn Rust/WASM while making something fun and useful.

![Audio Nodes demo](./audio-nodes.png)


## Index

- [Introduction](#introduction)
  - [What is it?](#what-is-it)
  - [How it works](#how-it-works)
- [Developer Guide](#developer-guide)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Build the Audio Engine (WASM)](#build-the-audio-engine-wasm)
  - [Run the app](#run-the-app)
  - [Project structure](#project-structure)
  - [Architecture overview](#architecture-overview)
    - [Audio processing pipeline](#audio-processing-pipeline)
    - [MIDI system](#midi-system)
    - [Clock & timing](#clock--timing)
    - [UI layer & design language](#ui-layer--design-language)
  - [Adding a node (Rust + TypeScript)](#adding-a-node-rust--typescript)
  - [Troubleshooting](#troubleshooting)
- [Available nodes](#available-nodes)

---

## Introduction

### What is it?

Audio Nodes lets you create simple synth and effect chains by connecting visual blocks: for example, MIDI Input → Synthesizer → Reverb → Speaker. You can tweak parameters in real time and hear the result instantly.

- In: MIDI or generated notes (Sequencer)
- Process: Oscillator/Synth, Reverb, Transpose, etc.
- Out: Speaker (final output)

> [!IMPORTANT]
> Audio is silent unless at least one Speaker node is present. Only audio reaching a Speaker input is heard.

### How it works

- Each block (node) does one job (make sound, change sound, or route sound).
- You drag cables between nodes to define the flow.
- The final node “Speaker” is the output to your device—connect to it to hear anything.
- Everything runs in your browser.

---

## Developer Guide

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/) + [wasm-pack](https://rustwasm.github.io/wasm-pack/)

### Installation

```bash
git clone <repository-url>
cd audio-nodes
npm install
```

### Build the Audio Engine (WASM)

Builds the Rust engine and copies wasm-bindgen outputs into both `public/audio-engine-wasm/` and `src/audio-engine-wasm/`:

```bash
npm run build:wasm
```

### Run the app

```bash
npm run dev
# open http://localhost:3000
```

> [!TIP]
> If audio doesn’t start, interact with the page (click) to allow the browser to start the AudioContext.

### Project structure

```
audio-nodes/
├── public/
│   ├── worklets/
│   │   └── audio-engine-processor.js      # AudioWorkletProcessor (runs DSP)
│   ├── audio-engine-wasm/                 # wasm-bindgen output served by Next.js
│   │   ├── audio_engine.js
│   │   ├── audio_engine_bg.wasm
│   │   └── *.d.ts / package.json
│   └── projects/
│       └── default-project.json           # Example project
├── src/
│   ├── app/                               # Next.js App Router
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── nodes/                         # Node UI components (React)
│   │   │   ├── MidiInputNode.tsx
│   │   │   ├── MidiTransposeNode.tsx
│   │   │   ├── OscillatorNode.tsx
│   │   │   ├── ReverbNode.tsx
│   │   │   ├── SequencerNode.tsx
│   │   │   ├── SpeakerNode.tsx
│   │   │   └── SynthesizerNode.tsx
│   │   ├── node-ui/                       # Handle layer + shared node UI
│   │   ├── edges/                         # Custom React Flow edges
│   │   ├── AudioNodesEditor.tsx           # Main editor
│   │   ├── NodeLibrary.tsx                # Node palette/library
│   │   ├── SaveLoadPanel.tsx              # Project persistence UI
│   │   └── TitleBarCreds.tsx              # Header/nav
│   ├── hooks/
│   │   ├── useAudioEngine.ts              # Bootstraps worklet + wasm in page
│   │   ├── useGraph.ts                    # Graph state (React Flow)
│   │   ├── useProjectPersistence.ts       # Save/load (file + localStorage)
│   │   └── useWasm.ts                     # WASM loader glue
│   ├── lib/
│   │   ├── audioManager.ts                # Manages worklet graph + messages
│   │   ├── handles.ts
│   │   ├── nodeRegistry.ts                # Metadata (colors, categories)
│   │   ├── nodes.ts                       # Node type defaults and helpers
│   │   └── utils.ts
│   ├── types/
│   │   └── project.ts
│   └── audio-engine-wasm/                 # Local copy of wasm-bindgen pkg
├── audio-engine/                          # Rust audio processing engine
│   ├── src/
│   │   ├── nodes/
│   │   │   ├── oscillator.rs
│   │   │   ├── reverb.rs
│   │   │   ├── speaker.rs
│   │   │   ├── synth.rs
│   │   │   └── transpose.rs
│   │   └── lib.rs
│   ├── Cargo.toml
│   └── pkg/                               # wasm-pack build output
├── build-wasm.sh                           # Builds + copies wasm artifacts
└── README.md
```

### Architecture overview

#### Audio processing pipeline

- DSP implemented in Rust, compiled with [wasm-bindgen](https://rustwasm.github.io/wasm-bindgen/) to WASM.
- Main thread spins up an [AudioWorkletNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode), fetches glue (`audio_engine.js`) + `.wasm` from `public/audio-engine-wasm/`, then posts to the worklet.
- The [AudioWorkletProcessor](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor) initializes the WASM and processes audio off the main thread.
- UI sends node graph updates and parameter changes via `postMessage` to the worklet.
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) is used for transport/output (context + destination). All synthesis/effects/mixing happen in WASM.

#### MIDI system

- Raw MIDI bytes for universal compatibility.
- Optional sample‑accurate scheduling using `atFrame` (0..blockSize‑1) or time‑based `atTimeMs`.
- Routing rule: `midi-out → midi-in` only.
- Worklet maintains per‑node MIDI queues and routes messages accordingly.

#### Clock & timing

- Global transport (default 120 BPM) exists implicitly when no clock node is connected.
- Future clock nodes allow multiple tempos/polymeter.
- Scheduling per block, with room for swing/humanize.

#### UI layer & design language

- [React Flow](https://reactflow.dev) for node graph, [Tailwind CSS](https://tailwindcss.com/) for styling.
- Two-column layout: inputs/params (left), outputs (right), both top‑aligned.
- Handle shapes encode type: audio (circle), midi (square), numeric (diamond), boolean (triangle), string/enum (pentagon).
- Accent color used for borders, titles, active handles.

### Adding a node (Rust + TypeScript)

High‑level steps to add a new node type that processes audio or MIDI.

1) Rust/WASM (audio‑engine)
- Create `audio-engine/src/nodes/<your_node>.rs` (e.g. [`audio-engine/src/nodes/synth.rs`](audio-engine/src/nodes/synth.rs)) and implement processing.
- Expose a wasm‑bindgen interface in [`audio-engine/src/lib.rs`](audio-engine/src/lib.rs) (constructors, getters/setters, process functions).
- Rebuild artifacts:

```bash
npm run build:wasm
```

2) Worklet wiring
- Ensure [`public/worklets/audio-engine-processor.js`](public/worklets/audio-engine-processor.js) initializes your exported functions or uses the generic engine API to create/update your node.
- Update message handling if your node needs special messages.

3) UI (React/TypeScript)
- Add a React component in `src/components/nodes/` (e.g. [`src/components/nodes/SynthesizerNode.tsx`](src/components/nodes/SynthesizerNode.tsx)).
- Register defaults and metadata in [`src/lib/nodes.ts`](src/lib/nodes.ts) and [`src/lib/nodeRegistry.ts`](src/lib/nodeRegistry.ts).
- If the node emits/consumes MIDI, ensure [`src/components/AudioNodesEditor.tsx`](src/components/AudioNodesEditor.tsx) and [`src/lib/audioManager.ts`](src/lib/audioManager.ts) are aware of its ports.

Tip: Most parameter changes flow through a common `onParameterChange(nodeId, key, value)` pattern—wire your UI controls to it and let the worklet sync happen automatically.

### Troubleshooting

- No sound? Add a Speaker node and ensure an audio signal reaches it.
- Browser blocked audio start? Click anywhere (user gesture) to start the AudioContext.
- WASM didn’t load? Run `npm run build:wasm` and check the console for network errors loading files in `public/audio-engine-wasm/`.

[Back to top](#audio-nodes)


## Project plan (roadmap)

This is a living checklist of planned features. Tick items will be updated as we land them. Feel free to open issues/PRs to discuss or contribute.

### Core nodes

- [ ] Arpeggiator node
  - [ ] Modes (up, down, up-down, random, chord, custom)
  - [ ] Rate (note value), gate, octave range, swing
  - [ ] Latch/hold, tie overlaps
  - [ ] Clock sync and reset input
- [ ] Chords node
  - [ ] Triads/7ths/extended chords, inversions, spread/voicing
  - [ ] Key/scale awareness, Roman numerals input
  - [ ] Arp/gate output option
- [ ] Envelope node (mod)
  - [ ] ADSR and multi-stage
  - [ ] Trigger input, retrigger, one-shot/loop
  - [ ] Param-out for modulation
- [ ] Sampler node
  - [ ] Load samples (drag & drop, file picker)
  - [ ] Basic playback: one-shot, loop, start offset, length
  - [ ] Multi-sample mapping by MIDI note/velocity
  - [ ] Envelopes (ADSR), filter, gain
  - [ ] Disk/HTTP streaming for long samples (progressive)
  - [ ] WASM-side resampling/interpolation (high quality)
- [ ] LFO node
  - [ ] Shapes (sine, tri, saw, square, random S&H)
  - [ ] Rate, sync, phase, offset, depth
  - [ ] Param-out for modulation

### Effects nodes

- [ ] Delay (mono/stereo)
  - [ ] Time (ms/sync), feedback, mix
  - [ ] Ping-pong mode
- [ ] Chorus/Flanger
  - [ ] Rate, depth, feedback, mix
- [ ] Phaser
  - [ ] Stages, rate, depth, feedback, mix
- [ ] Distortion/Saturation
  - [ ] Drive, tone, mix; multiple curves
- [ ] EQ (simple 3-band)
  - [ ] Low/Mid/High gain, frequency, Q (where applicable)
- [ ] Compressor
  - [ ] Threshold, ratio, attack, release, makeup gain
- [ ] Filter node (separate from synth)
  - [ ] LP/HP/BP/Notch, cutoff, resonance, key track

### Utilities and routing

- [ ] Mixer node (multi-input)
- [ ] Splitter/Merger nodes
- [ ] Gain node
- [ ] Meter/Scope/Analyzer (visualization)
- [ ] MIDI utilities: Scale quantizer, Velocity curve, Channel filter

### Editor UX

- [x] Copy/Paste selection (Cmd/Ctrl+C, Cmd/Ctrl+V)
- [x] Duplicate selection (Cmd/Ctrl+D)
- [x] Spawn new nodes at viewport center
- [ ] Multi-select marquee improvements
- [ ] Align/distribute selected nodes
- [ ] Snap grid settings and quick toggle
- [ ] Keyboard shortcuts reference overlay
- [ ] Context menu (right-click) for quick actions

### Project system

- [ ] Versioned project format with migrations — so older projects keep working as the app evolves
- [ ] Asset management (samples), project-local asset store — keep audio files with the project for easy moving/sharing
- [ ] Share/import projects via URL or file — quickly share patches or load presets from a link/file

### Performance and engine

- [ ] Audio engine profiling and benchmarks — measure where time goes to target the biggest speed-ups (recommended by AI)
- [ ] SIMD builds (wasm32-simd128) where available — use special CPU instructions to process many samples at once for smoother playback (recommended by AI)
- [ ] Worklet ring buffer optimizations — a faster pipe between the UI and the audio thread to reduce glitches and latency (recommended by AI)
- [ ] Offline render/export to WAV — render your patch to an audio file you can download

### Documentation

- [ ] Node reference docs (per node)
- [ ] Modulation/handles guide
- [ ] Contributing guide
- [ ] Architecture deep dive (engine + UI)

Have an idea for a node or feature? Open an issue with [feature] in the title and describe the use case. Contributions welcome!