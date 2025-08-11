use wasm_bindgen::prelude::*;

pub mod nodes;

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

// Audio engine initialization
#[wasm_bindgen]
pub struct AudioEngine {
    sample_rate: f32,
    buffer_size: usize,
}

#[wasm_bindgen]
impl AudioEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> AudioEngine {
        console_log!("AudioEngine initialized with sample rate: {}", sample_rate);
        AudioEngine {
            sample_rate,
            buffer_size: 512,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn sample_rate(&self) -> f32 {
        self.sample_rate
    }

    #[wasm_bindgen(getter)]
    pub fn buffer_size(&self) -> usize {
        self.buffer_size
    }

    pub fn process_audio(&mut self, output: &mut [f32]) {
        // This will be the main audio processing loop
        // For now, just fill with silence
        for sample in output.iter_mut() {
            *sample = 0.0;
        }
    }
}

pub use nodes::transpose::MidiTransposeNode;

// SynthNode is defined in nodes/mod.rs
