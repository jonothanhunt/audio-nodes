#!/bin/bash

# Build the Rust/WASM audio engine
echo "Building Rust/WASM audio engine..."
cd audio-engine
wasm-pack build --target web

# Copy the generated files to the Next.js src directory (for main-thread imports)
echo "Copying WASM files to Next.js src directory..."
cd ..
mkdir -p src/audio-engine-wasm
cp -r audio-engine/pkg/. src/audio-engine-wasm/

# Also copy to public for AudioWorklet to import by URL
echo "Copying WASM files to public directory for AudioWorklet..."
mkdir -p public/audio-engine-wasm
cp -r audio-engine/pkg/. public/audio-engine-wasm/

echo "✅ WASM build complete!"
