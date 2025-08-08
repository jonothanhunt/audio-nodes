# AudioNodes V3

A Next.js-based visual audio programming environment using Rust/WebAssembly for audio processing.

## 🎵 Features

- **Node-based audio editor** with visual programming interface
- **Rust/WASM audio engine** for high-performance audio processing
- **Real-time parameter control** with live audio updates
- **Three core nodes**: Oscillator, Reverb, and Speaker
- **Dark theme UI** matching professional audio software

## 🛠️ Tech Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS, React Flow
- **Audio Engine**: Rust with wasm-bindgen
- **Build Tools**: wasm-pack, Turbopack

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

3. Build the Rust/WASM audio engine:
```bash
cd audio-engine
wasm-pack build --target web
cd ..
```

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) to view the application.

## 📁 Project Structure

```
audio-nodes-v3/
├── src/
│   ├── app/                    # Next.js App Router
│   ├── components/             # React components
│   │   ├── nodes/             # Node UI components
│   │   │   ├── OscillatorNode.tsx
│   │   │   ├── ReverbNode.tsx
│   │   │   └── SpeakerNode.tsx
│   │   ├── AudioNodesEditor.tsx
│   │   └── NodeLibrary.tsx
│   ├── hooks/
│   │   └── useWasm.ts         # WASM integration hook
│   └── audio-engine-wasm/     # Generated WASM package
├── audio-engine/              # Rust audio processing
│   ├── src/
│   │   ├── nodes/             # Audio processing nodes
│   │   │   ├── oscillator.rs
│   │   │   ├── reverb.rs
│   │   │   └── speaker.rs
│   │   ├── lib.rs
│   │   └── nodes/mod.rs
│   └── Cargo.toml
└── README.md
```

## 🎛️ Available Nodes

### Oscillator Node
- **Type**: Synthesis
- **Parameters**: Frequency, Amplitude, Waveform
- **Waveforms**: Sine, Square, Sawtooth, Triangle
- **Outputs**: Audio signal

### Reverb Node  
- **Type**: Effect
- **Parameters**: Feedback, Wet Mix
- **Inputs**: Audio signal
- **Outputs**: Processed audio with reverb

### Speaker Node
- **Type**: Utility  
- **Parameters**: Volume, Mute
- **Inputs**: Audio signal
- **Outputs**: Final audio output

## 🔧 Adding New Nodes

To add a new audio node:

1. Create the Rust implementation in `audio-engine/src/nodes/new_node.rs`
2. Create the UI component in `src/components/nodes/NewNode.tsx`
3. Update `audio-engine/src/nodes/mod.rs` to export the new node
4. Add the node to the node library in `src/components/NodeLibrary.tsx`
5. Register the node type in `src/components/AudioNodesEditor.tsx`
6. Rebuild the WASM package

## 🎯 Architecture

### Audio Processing
- All audio processing happens in Rust/WASM
- No Web Audio API usage (except for final output)
- Real-time parameter updates from UI to audio engine
- Fixed buffer size processing (512 samples)

### UI Layer
- React Flow for node-based editing
- TypeScript for type safety
- Tailwind CSS for consistent styling
- Real-time parameter binding

## 📝 Scripts

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production
- `npm run build:wasm` - Build Rust/WASM audio engine
- `npm run wasm:watch` - Auto-rebuild WASM when Rust files change (requires `watchexec`)
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### WASM Development Workflow

1. **Quick rebuild**: `npm run build:wasm`
2. **Auto-rebuild during development**: `npm run wasm:watch` (install `watchexec` first: `cargo install watchexec-cli`)
3. **Manual rebuild**: `./build-wasm.sh`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add your node implementations (both Rust and TypeScript)
4. Test the audio processing
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.
