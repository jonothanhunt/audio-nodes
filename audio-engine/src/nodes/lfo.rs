use wasm_bindgen::prelude::*;

#[derive(Clone, Copy)]
pub enum LfoWaveform {
    Sine,
    Triangle,
    Saw,
    Square,
}

#[wasm_bindgen]
pub struct LfoNode {
    sample_rate: f32,
    phase: f32,
    waveform: LfoWaveform,
    // Length of one full cycle in beats (e.g. 1.0 => one cycle per beat, 4.0 => one cycle every 4 beats)
    beats_per_cycle: f32,
    // Phase offset 0..1 applied when sampling value (does not accumulate)
    phase_offset: f32,
}

#[wasm_bindgen]
impl LfoNode {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> LfoNode {
        LfoNode {
            sample_rate,
            phase: 0.0,
            waveform: LfoWaveform::Sine,
            beats_per_cycle: 1.0,
            phase_offset: 0.0,
        }
    }

    // waveform_index: 0=sine,1=triangle,2=saw,3=square
    #[wasm_bindgen]
    pub fn set_params(&mut self, beats_per_cycle: f32, waveform_index: u32, phase_offset: f32) {
        let b = if beats_per_cycle <= 0.0001 { 0.0001 } else { beats_per_cycle };
        self.beats_per_cycle = b;
        self.waveform = match waveform_index { 1 => LfoWaveform::Triangle, 2 => LfoWaveform::Saw, 3 => LfoWaveform::Square, _ => LfoWaveform::Sine };
        self.phase_offset = phase_offset.clamp(0.0, 1.0);
    }

    // Advance phase by block and return raw waveform value in [-1,1] at the START of the block.
    // bpm passed in each call so tempo changes immediately reflect.
    #[wasm_bindgen]
    pub fn next_value(&mut self, block_samples: usize, bpm: f32) -> f32 {
        let mut bpm_c = bpm;
        if !bpm_c.is_finite() || bpm_c <= 0.0 { bpm_c = 120.0; }
        let freq_hz = (bpm_c / 60.0) / self.beats_per_cycle; // cycles per second
        // Sample current phase (with offset) first
        let mut sample_phase = self.phase + self.phase_offset * std::f32::consts::TAU;
        // Wrap
        while sample_phase >= std::f32::consts::TAU { sample_phase -= std::f32::consts::TAU; }
        let val = match self.waveform {
            LfoWaveform::Sine => sample_phase.sin(),
            LfoWaveform::Triangle => {
                // Normalized ramp t 0..1
                let t = sample_phase / std::f32::consts::TAU; // 0..1
                // Triangle wave from t
                if t < 0.25 { t * 4.0 } else if t < 0.75 { 2.0 - t * 4.0 } else { t * 4.0 - 4.0 }
            }
            LfoWaveform::Saw => {
                let t = sample_phase / std::f32::consts::TAU; // 0..1
                (t * 2.0) - 1.0
            }
            LfoWaveform::Square => if sample_phase.sin() >= 0.0 { 1.0 } else { -1.0 },
        };
        // Advance phase for next block
        let advance = (block_samples as f32) * freq_hz / self.sample_rate * std::f32::consts::TAU;
        self.phase += advance;
        while self.phase >= std::f32::consts::TAU { self.phase -= std::f32::consts::TAU; }
        val.max(-1.0).min(1.0)
    }
}
