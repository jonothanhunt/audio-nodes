use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct SpeakerNode {
    volume: f32,
    muted: bool,
}

#[wasm_bindgen]
impl SpeakerNode {
    #[wasm_bindgen(constructor)]
    pub fn new() -> SpeakerNode {
        SpeakerNode {
            volume: 0.8,
            muted: false,
        }
    }

    #[wasm_bindgen(setter)]
    pub fn set_volume(&mut self, volume: f32) {
        self.volume = volume.clamp(0.0, 1.0);
    }

    #[wasm_bindgen(getter)]
    pub fn volume(&self) -> f32 {
        self.volume
    }

    #[wasm_bindgen(setter)]
    pub fn set_muted(&mut self, muted: bool) {
        self.muted = muted;
    }

    #[wasm_bindgen(getter)]
    pub fn muted(&self) -> bool {
        self.muted
    }

    pub fn process(&self, input: &[f32], output: &mut [f32]) {
        if self.muted {
            // If muted, fill output with silence
            for sample in output.iter_mut() {
                *sample = 0.0;
            }
        } else {
            // Apply volume and copy input to output
            for (i, &input_sample) in input.iter().enumerate() {
                output[i] = input_sample * self.volume;
            }
        }
    }
}
