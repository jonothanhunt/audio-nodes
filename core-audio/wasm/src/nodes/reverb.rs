use crate::dsp::Smoothed;
use wasm_bindgen::prelude::*;

/// Both controls affect the output level directly, so they need to be ramped rather than
/// stepped once per render quantum.
const PARAM_SMOOTHING_SEC: f32 = 0.010;

#[wasm_bindgen]
pub struct ReverbNode {
    delay_line: Vec<f32>,
    write_index: usize,
    delay_samples: usize,
    feedback: Smoothed,
    wet_mix: Smoothed,
}

#[wasm_bindgen]
impl ReverbNode {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> ReverbNode {
        let delay_time = 0.1; // 100ms delay
        let delay_samples = ((delay_time * sample_rate) as usize).max(1);

        ReverbNode {
            delay_line: vec![0.0; delay_samples],
            write_index: 0,
            delay_samples,
            feedback: Smoothed::new(0.3, PARAM_SMOOTHING_SEC, sample_rate),
            wet_mix: Smoothed::new(0.3, PARAM_SMOOTHING_SEC, sample_rate),
        }
    }

    #[wasm_bindgen(setter)]
    pub fn set_feedback(&mut self, feedback: f32) {
        self.feedback.set_target(feedback.clamp(0.0, 0.95));
    }

    #[wasm_bindgen(getter)]
    pub fn feedback(&self) -> f32 {
        self.feedback.current()
    }

    #[wasm_bindgen(setter)]
    pub fn set_wet_mix(&mut self, wet_mix: f32) {
        self.wet_mix.set_target(wet_mix.clamp(0.0, 1.0));
    }

    #[wasm_bindgen(getter)]
    pub fn wet_mix(&self) -> f32 {
        self.wet_mix.current()
    }

    /// Peak absolute value still circulating in the delay line. The worklet uses this to
    /// decide when a disconnected reverb has finished ringing and can be dropped, so a
    /// tail decays naturally instead of being cut off mid-air.
    #[wasm_bindgen]
    pub fn tail_peak(&self) -> f32 {
        self.delay_line
            .iter()
            .fold(0.0f32, |acc, s| acc.max(s.abs()))
    }

    pub fn process(&mut self, input: &[f32], output: &mut [f32]) {
        let n = input.len().min(output.len());
        for i in 0..n {
            let input_sample = input[i];
            let feedback = self.feedback.tick();
            let wet = self.wet_mix.tick();

            // Read from delay line
            let delayed_sample = self.delay_line[self.write_index];

            // Calculate output with feedback
            let processed_sample = input_sample + (delayed_sample * feedback);

            // Write to delay line, guarding against a runaway from a non-finite input
            self.delay_line[self.write_index] = if processed_sample.is_finite() {
                processed_sample
            } else {
                0.0
            };

            // Mix dry and wet signals
            output[i] = input_sample * (1.0 - wet) + delayed_sample * wet;

            // Advance write index
            self.write_index += 1;
            if self.write_index >= self.delay_samples {
                self.write_index = 0;
            }
        }
    }
}
