use wasm_bindgen::prelude::*;

pub mod nodes;
pub mod dsp;

// Import the `console.log` function from the `console` module of web_sys
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

// Define a macro for logging
macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

// The exported components in this WASM module are individual DSP and MIDI nodes 
// (e.g. Oscillator, Reverb, Transpose) rather than a single monolithic engine.
// The Javascript AudioWorkletProcessor instantiates these nodes and orchestrates
// the routing, rendering, and timing for the entire graph.

pub use nodes::transpose::MidiTransposeNode;

// Node implementations are exported from their respective modules
// (e.g., SynthNode, OscillatorNode, ReverbNode, LfoNode)
