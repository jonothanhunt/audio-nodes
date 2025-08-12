# Audio Nodes

A Next.js-based visual audio programming environment using Rust/WebAssembly for audio processing.

I love node-based dev and music, so I thought the wasm approach would be a good opportunity to learn Rust.

## 🎵 Features

- Node-based audio editor with visual programming interface
- Rust/WASM audio engine for high-performance audio processing
- AudioWorklet-based, off-main-thread DSP
- Real-time parameter control with live audio updates
- MIDI support with raw MIDI bytes standard
- Multiple audio nodes: Oscillator, Reverb, Speaker, Sequencer, and Synthesizer
- Project save/load functionality
- Dark theme UI with purple/blue accents matching professional audio software

## 🛠️ Tech Stack

- Frontend: Next.js 15, TypeScript, Tailwind CSS, React Flow
- Audio Engine: Rust with wasm-bindgen
- Audio Pipeline: Web Audio API (AudioContext + AudioWorkletNode for transport only)
- Build Tools: wasm-pack, Webpack

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Rust with wasm-pack installed

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd audio-nodes
```

2. Install dependencies:

```bash
npm install
```

3. Build the Rust/WASM audio engine (copies artifacts to `public/audio-engine-wasm` and `src/audio-engine-wasm`):

```bash
npm run build:wasm
```

4. Start the development server:

```bash
npm run dev
```

5. Open http://localhost:3000 to view the application.

## 📁 Project Structure

```
audio-nodes/
├── public/
│   ├── worklets/
│   │   └── audio-engine-processor.js   # AudioWorkletProcessor (runs DSP)
│   ├── audio-engine-wasm/              # wasm-bindgen output served by Next.js
│   │   ├── audio_engine.js
│   │   ├── audio_engine_bg.wasm
│   │   └── *.d.ts / package.json
│   └── projects/                       # Default project files
│       └── default-project.json
├── src/
│   ├── app/                            # Next.js App Router
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── nodes/                      # Node UI components
│   │   │   ├── OscillatorNode.tsx
│   │   │   ├── ReverbNode.tsx
│   │   │   ├── SpeakerNode.tsx
│   │   │   ├── SequencerNode.tsx
│   │   │   └── SynthesizerNode.tsx
│   │   ├── AudioNodesEditor.tsx        # Main node editor component
│   │   ├── NodeLibrary.tsx             # Node palette/library
│   │   ├── SaveLoadPanel.tsx           # Project persistence UI
│   │   └── TitleBarCreds.tsx           # Header component
│   ├── hooks/                          # React hooks
│   │   ├── useAudioEngine.ts
│   │   ├── useGraph.ts
│   │   ├── useProjectPersistence.ts
│   │   └── useWasm.ts
│   ├── lib/
│   │   ├── audioManager.ts             # Initializes worklet, manages graph, bootstraps WASM
│   │   ├── handles.ts                  # Node handle types and utilities
│   │   ├── nodes.ts                    # Node type definitions
│   │   └── utils.ts                    # Utility functions
│   ├── types/
│   │   └── project.ts                  # Project data structures
│   └── audio-engine-wasm/              # Local copy of wasm-bindgen pkg (types/JS glue)
├── audio-engine/                       # Rust audio processing
│   ├── src/
│   │   ├── nodes/
│   │   │   ├── oscillator.rs
│   │   │   ├── reverb.rs
│   │   │   ├── speaker.rs
│   │   │   ├── synth.rs
│   │   │   └── mod.rs
│   │   └── lib.rs
│   ├── Cargo.toml
│   └── pkg/                           # wasm-pack build output
├── build-wasm.sh                       # Builds + copies wasm-bindgen artifacts
└── README.md
```

## 🎯 Architecture

### Audio Processing

- All DSP is implemented in Rust and compiled to WebAssembly.
- The main thread initializes an `AudioWorkletNode` and bootstraps the WASM into the worklet by fetching the wasm-bindgen glue (`audio_engine.js`) and `.wasm` bytes from `public/audio-engine-wasm/`, then posting them to the worklet.
- The `AudioWorkletProcessor` evaluates the glue, initializes the WASM, and processes audio buffers off the main thread.
- The UI sends graph updates (nodes, parameters, connections) to the worklet via `postMessage`. Payloads are structured-clone safe.
- Web Audio API is used only for transport/output (AudioContext, AudioWorkletNode, and destination). All synthesis/effects/mixing happen in WASM.
- Processing occurs in the browser's native block size (typically 128 frames per render quantum).

### MIDI System

- Uses raw MIDI bytes standard for universal compatibility
- Supports sample-accurate timing with `atFrame` (0..blockSize-1) or `atTimeMs` fallback
- MIDI routing: `midi-out → midi-in` connections only
- Worklet maintains per-node MIDI queues and handles routing
- Sequencer nodes emit Note On/Off events; Synthesizer nodes consume MIDI input

### Clock & Timing Design

Hybrid approach:

- Global Transport: implicit, auto-runs (default 120 BPM) if no explicit Clock node is connected to a timing-dependent node. Stored in project root. Can be surfaced as a node later.
- Clock Nodes: explicit timing sources allowing multiple simultaneous tempos / polymeter.

Clock Node Parameters:

- bpm: number
- ppq: ticks per quarter (default 96) for fine resolution
- beats_per_bar: default 4 (user adjustable)
- swing_pct: 0–0.6 applied to chosen subdivision (swing_subdivision: 1/8 or 1/16)
- run (bool), reset (trigger)
- phase_offset_beats: fractional start offset
- ratio: optional multiplier/divider relative to another clock (future Clock Ratio node)

Outputs (internal timing message, not over UI thread):
`{ type: "clock", clockId, tick, ppq, beat, bar, atFrame }`

Scheduling Algorithm (per block):

1. frames_per_tick = sample_rate _ 60 / (bpm _ ppq)
2. While next_tick_frame < block_end emit tick (store atFrame = next_tick_frame - block_start)
3. Apply swing by lengthening every second subdivision tick and shortening the preceding one (preserve total period).
4. Update counters (tick→beat→bar).

Tempo Change: applied after current block's scheduled ticks (simple). Future: mid-block proportional adjustment.

Sequencer Resolution: derives step timing by dividing incoming ticks (e.g. step every 24 ticks for 1/16 at ppq=96).

Multiple Clocks: Each sequencer chooses one clock input; if none, uses global transport. Advanced polymetric setups connect different clocks to different sequencers.

Future Enhancements:

- Clock Ratio node (derives child tempo by ratio while phase-aligning bar starts)
- Tap Tempo & Tempo Automation events
- Humanize / Groove nodes that post-process tick timing

### UI Layer

- React Flow for node-based editing and connections
- TypeScript for strong typing of node parameters and messages
- Tailwind CSS with dark theme and purple/blue accents (#8b5cf6, #3b82f6)
- Real-time parameter binding from UI to worklet
- Project save/load with JSON serialization

### 🎨 Node UI Design Language (Best Practices)

These guidelines define the consistent visual & interaction language for all node components:

1. Column Layout
    - Two columns: LEFT = all inputs & parameter controls; RIGHT = outputs only.
    - Both columns are TOP-aligned (no vertical centering of a lone output).
    - Sources with no inputs (e.g. MIDI In) still use the two-column layout: left column shows inputs (no handles), right column shows a top-aligned output label (e.g. “MIDI Out”) used to align the handle.
    - If a node has no outputs (pure sink like Speaker) omit the right column; retain padding symmetry.

2. Inputs Without Handles
    - Some parameters are purely local UI (e.g. a preset selector) and have no inbound connection handle.
    - They still occupy a normal row (label + control) for consistent vertical rhythm.
    - Only rows representing connectable params get a left handle; others are purely visual.

3. Parameter Rows & Registration
    - Each param row registers itself for vertical alignment; the handle layer decides which ones become handles based on param metadata (type lists).
    - Adding a new param = update the config array; UI + handle (if applicable) appear automatically.

4. Vertical Alignment of Handles
    - Computed from the vertical center of each registered row using a shared provider & ResizeObserver.
    - Absolute-positioned handles sit just outside the card edge (`left: -size/2` or `right: -size/2`).

5. Handle Styling & Sizes
    - Variants & sizes: numeric = 16px diamond (rotated square), audio out = 18px circle, string/select = 20px pentagon, midi = 16px square, bool = 20px triangle (SVG).
    - Base (disconnected) background: `#111827` except SVG variants which use transparent background and `--fill`.
    - Border: `1px solid accentColor` (SVG variants use stroke in the SVG instead).
    - Hover: fill/background switches to accentColor (SVG sets `--fill`).

6. Handle Shape Semantics
    - Audio: circle. Numeric/continuous: diamond. String/enum: pentagon. MIDI/event: square. Boolean/gate: triangle.

7. Accent Usage
    - Card border + selection glow; title icon + text; subtle gradient overlay; slider fill; active handle fills.

8. Parameter Defaults & Persistence
    - On mount, any missing param is initialized (idempotent) using config defaults.

9. Input Components
    - Number + Select share unified width (`w-28`), center text for numeric consistency. Drag prevention on interactive controls.

10. Sliders

- Auto-render for Number params with both min and max.

11. Top Alignment Rule (Reiterated)

- Inputs and outputs remain top-aligned regardless of differing column heights to aid scanning across multiple selected nodes.

## 🎛️ Available Nodes

- Oscillator: Audio source (Frequency, Amplitude, Waveform). Output: Audio.
- Reverb: Effect (Feedback, Wet Mix). Input: Audio. Output: Audio.
- Speaker: Sink (Volume, Mute). Input: Audio. Output: Final mix.
- Sequencer: MIDI generator (pattern grid, BPM, Play). Output: MIDI.
- Synthesizer: Poly synth (Preset, Waveform, ADSR, Filter, Glide, Gain, Voices). Input: MIDI. Output: Audio.
- MIDI Input: Source (Device, Channel). Output: MIDI.

```diff
- If no Speaker is present, sources used to mix directly to output.
+ Audio is silent unless at least one Speaker node is present. Only audio reaching a Speaker input is heard.
```
