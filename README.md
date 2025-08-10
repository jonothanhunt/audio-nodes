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
1. frames_per_tick = sample_rate * 60 / (bpm * ppq)
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

## 🎛️ Available Nodes

### Oscillator Node
- Type: Synthesis
- Parameters: Frequency, Amplitude, Waveform (Sine, Square, Sawtooth, Triangle)
- Outputs: Audio signal

### Reverb Node
- Type: Effect
- Parameters: Feedback, Wet Mix
- Inputs: Audio signal
- Outputs: Processed audio with reverb

### Speaker Node
- Type: Utility
- Parameters: Volume, Mute
- Inputs: Audio signal
- Outputs: Final audio output

### Sequencer Node
- Type: MIDI Generator
- Parameters: Pattern, BPM, Gate Length
- Outputs: MIDI events (Note On/Off)

### Synthesizer Node
- Type: Synthesis
- Parameters: Preset, Waveform, ADSR, Filter Cutoff/Resonance, Glide, Gain
- Inputs: MIDI events
- Outputs: Audio signal

### MIDI Input Node
- Type: MIDI Source
- Parameters: Device ID (optional), Channel filter (All or 1–16)
- Outputs: MIDI events (raw bytes)
- Notes: Uses Web MIDI API on main thread, forwards events with `atTimeMs` for scheduling.

## 🧪 Planned / Upcoming Nodes

(Subject to change. Order roughly reflects build priority.)

### Clock / Transport Node
- Purpose: Explicit tempo source; supersedes global fallback when connected.
- Parameters: BPM, PPQ, Beats/Bar, Swing %, Swing Subdivision, Run, Phase Offset, Reset.
- Outputs: Clock timing messages (internal) + optional MIDI Clock (enable toggle).
- Notes: Multiple instances allow polymeter / tempo layering.

### MIDI Input Node
- Purpose: Receive external hardware MIDI (Web MIDI API on main thread) and forward bytes to worklet.
- Outputs: MIDI events.
- Notes: Device selector + optional channel filter.

### Computer Keyboard MIDI Node
- Purpose: Use QWERTY (GarageBand-style mapping) to emit Note On/Off.
- Outputs: MIDI events.
- Notes: Velocity mapping (fixed or based on key repeat speed later).

### MIDI Transposer Node
- Purpose: Shift incoming MIDI note numbers by semitones (with min/max note clamp).
- Parameters: Semitones (±24), Clamp Low, Clamp High, Pass Through Non-Note (bool).
- Inputs: MIDI.
- Outputs: MIDI (modified notes).

### MIDI Stepper / Note Step Effect Node
- Purpose: Apply a repeating sequence of pitch offsets / velocity values per incoming note event (step sequencer modifier).
- Parameters: Steps array (e.g. [-12,0,0,7]), Advance Mode (per note / per clock tick / per beat), Reset trigger.
- Inputs: MIDI (notes) + optional clock.
- Outputs: MIDI (transformed notes).

### Mixer / Crossfader Node
- Purpose: Blend or route between two (later N) audio inputs.
- Inputs: A, B audio; optional control input (future CV/modulation).
- Parameters: Mix (0–1), Output Gain.
- Outputs: Mixed audio.

### Echo / Delay Node
- Purpose: Feedback delay effect.
- Parameters: Delay Time (ms / sync later), Feedback, Wet, Tone (simple low-pass in feedback path).
- Inputs: Audio.
- Outputs: Audio.

### Value Nodes
- Number Value: Constant numeric control (e.g. mod source). Outputs: scalar per block.
- Boolean Value: On/Off gate (e.g. mute trigger).
- (Later) Random / Sample & Hold, Curve, Envelope follower.

### Sampler Node
- Purpose: Trigger playback of user-loaded audio buffers via MIDI (note = zone / pitch shift).
- Parameters: Start Offset, One-shot / Loop, Pitch Mode, Gain, Envelope.
- Project Packaging: Likely move to a zip-based project format (`project.json` + `/samples/*`). Interim: embed base64 or keep external URLs.

### LFO Node
- Purpose: Low frequency modulation source.
- Parameters: Shape, Rate, Depth, Phase, Offset, Sync (future), Target (UI only; routing via connections).
- Outputs: Control signal (float per frame or per block smoothed).

### Envelope Generator Node
- Purpose: ADSR triggered by MIDI Note On/Off (or gate input later).
- Parameters: A, D, S, R, Retrigger mode.
- Outputs: Control signal.

### Arpeggiator Node
- Purpose: Transform held MIDI chords into ordered patterns.
- Parameters: Mode (up/down/up-down/random), Rate, Octave Range, Gate.
- Inputs: MIDI chord.
- Outputs: MIDI stream.

### Euclidean / Pattern Rhythm Node
- Purpose: Generate rhythmic trigger patterns.
- Parameters: Steps, Pulses, Rotation, Rate.
- Outputs: MIDI Note or custom trigger byte (note-on style).

### Analyzer / Scope Node (UI Only DSP Passthrough)
- Purpose: Visualize waveform or spectrum for debugging.
- Inputs: Audio.
- Outputs: Audio (unchanged pass-through).

### Recorder Node
- Purpose: Capture mixed output to WAV (in-browser encoding) and allow download.
- Inputs: Audio.
- Outputs: (None) Provides downloadable file.

## 🔧 Adding New Nodes

1. Create the Rust implementation in `audio-engine/src/nodes/<new_node>.rs`.
2. Export the node in `audio-engine/src/nodes/mod.rs` and wire it in `audio-engine/src/lib.rs` as needed.
3. Create the UI component in `src/components/nodes/<NewNode>.tsx`.
4. Add the node to the Node Library in `src/components/NodeLibrary.tsx`.
5. Register the node type in `src/components/AudioNodesEditor.tsx` and `src/lib/nodes.ts`.
6. Rebuild the WASM package: `npm run build:wasm`.

## 📝 Scripts

- `npm run dev` - Start development server with Webpack
- `npm run build` - Build for production
- `npm run build:wasm` - Build Rust/WASM and copy artifacts to `public/` and `src/`
- `npm run wasm:watch` - Auto-rebuild WASM when Rust files change (requires `watchexec`)
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### WASM Development Workflow

1. Quick rebuild: `npm run build:wasm`
2. Auto-rebuild during development: `npm run wasm:watch` (install `watchexec` first: `cargo install watchexec-cli`)
3. Manual rebuild: `./build-wasm.sh`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add your node implementations (both Rust and TypeScript)
4. Test the audio processing
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.
