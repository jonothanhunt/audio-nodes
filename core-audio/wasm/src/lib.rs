//! Rust/WASM DSP core for Audio Nodes.
//!
//! The exported components in this WASM module are individual DSP and MIDI nodes
//! (e.g. Oscillator, Reverb, Transpose) rather than a single monolithic engine.
//! The AudioWorkletProcessor in `core-audio/worklet` instantiates these nodes and
//! orchestrates the routing, rendering, and timing for the entire graph.

pub mod dsp;
pub mod nodes;

// Node implementations are exported from their respective modules
// (e.g., SynthNode, OscillatorNode, ReverbNode, LfoNode).
pub use nodes::transpose::MidiTransposeNode;
