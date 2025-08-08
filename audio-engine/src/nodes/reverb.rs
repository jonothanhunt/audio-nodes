use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct ReverbNode {
    delay_line: Vec<f32>,
    write_index: usize,
    delay_samples: usize,
    feedback: f32,
    wet_mix: f32,
}

#[wasm_bindgen]
impl ReverbNode {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> ReverbNode {
        let delay_time = 0.1; // 100ms delay
        let delay_samples = (delay_time * sample_rate) as usize;
        
        ReverbNode {
            delay_line: vec![0.0; delay_samples],
            write_index: 0,
            delay_samples,
            feedback: 0.3,
            wet_mix: 0.3,
        }
    }

    #[wasm_bindgen(setter)]
    pub fn set_feedback(&mut self, feedback: f32) {
        self.feedback = feedback.clamp(0.0, 0.95);
    }

    #[wasm_bindgen(getter)]
    pub fn feedback(&self) -> f32 {
        self.feedback
    }

    #[wasm_bindgen(setter)]
    pub fn set_wet_mix(&mut self, wet_mix: f32) {
        self.wet_mix = wet_mix.clamp(0.0, 1.0);
    }

    #[wasm_bindgen(getter)]
    pub fn wet_mix(&self) -> f32 {
        self.wet_mix
    }

    pub fn process(&mut self, input: &[f32], output: &mut [f32]) {
        for (i, &input_sample) in input.iter().enumerate() {
            // Read from delay line
            let delayed_sample = self.delay_line[self.write_index];
            
            // Calculate output with feedback
            let processed_sample = input_sample + (delayed_sample * self.feedback);
            
            // Write to delay line
            self.delay_line[self.write_index] = processed_sample;
            
            // Mix dry and wet signals
            output[i] = input_sample * (1.0 - self.wet_mix) + delayed_sample * self.wet_mix;
            
            // Advance write index
            self.write_index = (self.write_index + 1) % self.delay_samples;
        }
    }
}
