use wasm_bindgen::prelude::*;

#[derive(Clone, Copy)]
pub enum Waveform {
    Sine,
    Square,
    Sawtooth,
    Triangle,
}

#[wasm_bindgen]
pub struct OscillatorNode {
    frequency: f32,
    amplitude: f32,
    waveform: Waveform,
    phase: f32,
    sample_rate: f32,
}

#[wasm_bindgen]
impl OscillatorNode {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> OscillatorNode {
        OscillatorNode {
            frequency: 440.0, // A4
            amplitude: 0.5,
            waveform: Waveform::Sine,
            phase: 0.0,
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
        self.waveform = match waveform {
            0 => Waveform::Sine,
            1 => Waveform::Square,
            2 => Waveform::Sawtooth,
            3 => Waveform::Triangle,
            _ => Waveform::Sine,
        };
    }

    pub fn process(&mut self, output: &mut [f32]) {
        let phase_increment = 2.0 * std::f32::consts::PI * self.frequency / self.sample_rate;
        
        for sample in output.iter_mut() {
            *sample = match self.waveform {
                Waveform::Sine => self.phase.sin(),
                Waveform::Square => if self.phase.sin() > 0.0 { 1.0 } else { -1.0 },
                Waveform::Sawtooth => (self.phase / std::f32::consts::PI) - 1.0,
                Waveform::Triangle => {
                    let t = (self.phase / (2.0 * std::f32::consts::PI)) % 1.0;
                    if t < 0.5 {
                        4.0 * t - 1.0
                    } else {
                        3.0 - 4.0 * t
                    }
                }
            } * self.amplitude;

            self.phase += phase_increment;
            if self.phase >= 2.0 * std::f32::consts::PI {
                self.phase -= 2.0 * std::f32::consts::PI;
            }
        }
    }
}
