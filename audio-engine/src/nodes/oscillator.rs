use wasm_bindgen::prelude::*;
use crate::dsp::{OscillatorCore, Waveform};

#[wasm_bindgen]
pub struct OscillatorNode {
    frequency: f32,
    amplitude: f32,
    core: OscillatorCore,
    sample_rate: f32,
}

#[wasm_bindgen]
impl OscillatorNode {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> OscillatorNode {
        OscillatorNode {
            frequency: 440.0, // A4
            amplitude: 0.5,
            core: OscillatorCore::new(),
            sample_rate,
        }
    }

    #[wasm_bindgen(setter)]
    pub fn set_frequency(&mut self, freq: f32) {
        self.frequency = freq;
    }

    #[wasm_bindgen(getter)]
    pub fn frequency(&self) -> f32 {
        self.frequency
    }

    #[wasm_bindgen(setter)]
    pub fn set_amplitude(&mut self, amp: f32) {
        self.amplitude = amp.clamp(0.0, 1.0);
    }

    #[wasm_bindgen(getter)]
    pub fn amplitude(&self) -> f32 {
        self.amplitude
    }

    pub fn set_waveform(&mut self, waveform: u32) {
        self.core.set_waveform_from_u32(waveform);
    }

    pub fn process(&mut self, output: &mut [f32]) {
        for sample in output.iter_mut() {
            *sample = self.core.tick(self.frequency, self.sample_rate) * self.amplitude;
        }
    }
}
