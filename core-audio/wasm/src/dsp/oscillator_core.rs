use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Waveform {
    Sine = 0,
    Square = 1,
    Sawtooth = 2,
    Triangle = 3,
}

#[derive(Clone, Copy)]
pub struct OscillatorCore {
    pub phase: f32,
    pub waveform: Waveform,
}

impl OscillatorCore {
    pub fn new() -> Self {
        Self {
            phase: 0.0,
            waveform: Waveform::Sine,
        }
    }

    pub fn set_waveform(&mut self, waveform: Waveform) {
        self.waveform = waveform;
    }

    pub fn set_waveform_from_u32(&mut self, waveform: u32) {
        self.waveform = match waveform {
            0 => Waveform::Sine,
            1 => Waveform::Square,
            2 => Waveform::Sawtooth,
            3 => Waveform::Triangle,
            _ => Waveform::Sine,
        };
    }

    #[inline]
    pub fn tick(&mut self, freq: f32, sample_rate: f32) -> f32 {
        let osc = match self.waveform {
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
        };

        let phase_increment = 2.0 * std::f32::consts::PI * freq / sample_rate;
        self.phase += phase_increment;
        if self.phase >= 2.0 * std::f32::consts::PI {
            self.phase -= 2.0 * std::f32::consts::PI;
        }

        osc
    }
}
