# AudioNodes V3

A Next.js-based visual audio programming environment using Rust/WebAssembly for audio processing.

## 🎵 Features

- Node-based audio editor with visual programming interface
- Rust/WASM audio engine for high-performance audio processing
- AudioWorklet-based, off-main-thread DSP
- Real-time parameter control with live audio updates
- Three core nodes: Oscillator, Reverb, and Speaker
- Dark theme UI matching professional audio software

## 🛠️ Tech Stack

- Frontend: Next.js 15, TypeScript, Tailwind CSS, React Flow
- Audio Engine: Rust with wasm-bindgen
- Audio Pipeline: Web Audio API (AudioContext + AudioWorkletNode for transport only)
- Build Tools: wasm-pack, Turbopack

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Rust with wasm-pack installed

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd audio-nodes-v3
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
audio-nodes-v3/
├── public/
│   ├── worklets/
│   │   └── audio-engine-processor.js   # AudioWorkletProcessor (runs DSP)
│   └── audio-engine-wasm/              # wasm-bindgen output served by Next.js
│       ├── audio_engine.js
│       ├── audio_engine_bg.wasm
│       └── *.d.ts / package.json
├── src/
│   ├── app/                            # Next.js App Router
│   ├── components/
│   │   ├── nodes/                      # Node UI components
│   │   │   ├── OscillatorNode.tsx
│   │   │   ├── ReverbNode.tsx
│   │   │   └── SpeakerNode.tsx
│   │   ├── AudioNodesEditor.tsx
│   │   └── NodeLibrary.tsx
│   ├── lib/
│   │   └── audioManager.ts             # Initializes worklet, manages graph, bootstraps WASM
│   └── audio-engine-wasm/              # Local copy of wasm-bindgen pkg (types/JS glue)
├── audio-engine/                       # Rust audio processing
│   ├── src/
│   │   ├── nodes/
│   │   │   ├── oscillator.rs
│   │   │   ├── reverb.rs
│   │   │   └── speaker.rs
│   │   ├── lib.rs
│   │   └── nodes/mod.rs
│   └── Cargo.toml
├── build-wasm.sh                        # Builds + copies wasm-bindgen artifacts
└── README.md
```

## 🎯 Architecture

### Audio Processing
- All DSP is implemented in Rust and compiled to WebAssembly.
- The main thread initializes an `AudioWorkletNode` and bootstraps the WASM into the worklet by fetching the wasm-bindgen glue (`audio_engine.js`) and `.wasm` bytes from `public/audio-engine-wasm/`, then posting them to the worklet.
- The `AudioWorkletProcessor` evaluates the glue, initializes the WASM, and processes audio buffers off the main thread.
- The UI sends graph updates (nodes, parameters, connections) to the worklet via `postMessage`. Payloads are structured-clone safe.
- Web Audio API is used only for transport/output (AudioContext, AudioWorkletNode, and destination). All synthesis/effects/mixing happen in WASM.
- Processing occurs in the browser’s native block size (typically 128 frames per render quantum).

### UI Layer
- React Flow for node-based editing and connections
- TypeScript for strong typing of node parameters and messages
- Tailwind CSS for consistent styling and dark theme
- Real-time parameter binding from UI to worklet

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

## 🔧 Adding New Nodes

1. Create the Rust implementation in `audio-engine/src/nodes/<new_node>.rs`.
2. Export the node in `audio-engine/src/nodes/mod.rs` and wire it in `audio-engine/src/lib.rs` as needed.
3. Create the UI component in `src/components/nodes/<NewNode>.tsx`.
4. Add the node to the Node Library in `src/components/NodeLibrary.tsx`.
5. Register the node type in `src/components/AudioNodesEditor.tsx`.
6. Rebuild the WASM package: `npm run build:wasm`.

## 📝 Scripts

- `npm run dev` - Start development server with Turbopack
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
