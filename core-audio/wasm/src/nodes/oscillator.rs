use crate::dsp::{OscillatorCore, Smoothed};
use wasm_bindgen::prelude::*;

/// Amplitude is a direct multiplier on the output, so it gets the shorter constant —
/// long enough to kill the click, short enough that a slider still feels immediate.
const AMPLITUDE_SMOOTHING_SEC: f32 = 0.008;

/// Frequency is smoothed a little more slowly. A stepped frequency is a discontinuity in
/// the phase *slope* rather than the sample value, which reads as a soft thump on low
/// notes and as zipper noise when an LFO drives it.
const FREQUENCY_SMOOTHING_SEC: f32 = 0.005;

#[wasm_bindgen]
pub struct OscillatorNode {
    frequency: Smoothed,
    amplitude: Smoothed,
    core: OscillatorCore,
    sample_rate: f32,
}

#[wasm_bindgen]
impl OscillatorNode {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> OscillatorNode {
        OscillatorNode {
            frequency: Smoothed::new(440.0, FREQUENCY_SMOOTHING_SEC, sample_rate), // A4
            amplitude: Smoothed::new(0.5, AMPLITUDE_SMOOTHING_SEC, sample_rate),
            core: OscillatorCore::new(),
            sample_rate,
        }
    }

    #[wasm_bindgen(setter)]
    pub fn set_frequency(&mut self, freq: f32) {
        self.frequency.set_target(freq);
    }

    #[wasm_bindgen(getter)]
    pub fn frequency(&self) -> f32 {
        self.frequency.current()
    }

    #[wasm_bindgen(setter)]
    pub fn set_amplitude(&mut self, amp: f32) {
        self.amplitude.set_target(amp.clamp(0.0, 1.0));
    }

    #[wasm_bindgen(getter)]
    pub fn amplitude(&self) -> f32 {
        self.amplitude.current()
    }

    pub fn set_waveform(&mut self, waveform: u32) {
        self.core.set_waveform_from_u32(waveform);
    }

    pub fn process(&mut self, output: &mut [f32]) {
        // Fast path: both parameters at rest, which is the common case. Skips two
        // multiply-adds per sample.
        if self.frequency.is_settled() && self.amplitude.is_settled() {
            let freq = self.frequency.current();
            let amp = self.amplitude.current();
            for sample in output.iter_mut() {
                *sample = self.core.tick(freq, self.sample_rate) * amp;
            }
            return;
        }

        for sample in output.iter_mut() {
            let freq = self.frequency.tick();
            let amp = self.amplitude.tick();
            *sample = self.core.tick(freq, self.sample_rate) * amp;
        }
    }
}
