#!/bin/bash

# Build the Rust/WASM audio engine
echo "Building Rust/WASM audio engine..."
cd audio-engine
wasm-pack build --target web

# Copy the generated files to the Next.js src directory
echo "Copying WASM files to Next.js src directory..."
cd ..
cp -r audio-engine/pkg/. src/audio-engine-wasm/

echo "✅ WASM build complete!"
