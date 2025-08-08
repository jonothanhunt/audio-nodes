use wasm_bindgen::prelude::*;

#[derive(Clone, Copy)]
pub enum Waveform {
    Sine,
    Square,
    Sawtooth,
    Triangle,
}

#[wasm_bindgen]
pub struct SynthNode {
    sample_rate: f32,
    // mono MVP (last-note priority)
    freq_target: f32,
    freq_current: f32,
    glide_time_sec: f32,
    gain: f32,
    waveform: Waveform,

    // ADSR
    attack: f32,
    decay: f32,
    sustain: f32,
    release: f32,
    env: f32,
    gate: bool,

    // osc phase
    phase: f32,
}

#[wasm_bindgen]
impl SynthNode {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> SynthNode {
        SynthNode {
            sample_rate,
            freq_target: 440.0,
            freq_current: 440.0,
            glide_time_sec: 0.0,
            gain: 0.5,
            waveform: Waveform::Sawtooth,
            attack: 0.005,
            decay: 0.12,
            sustain: 0.7,
            release: 0.12,
            env: 0.0,
            gate: false,
            phase: 0.0,
        }
    }

    #[wasm_bindgen]
    pub fn note_on(&mut self, note: u8, _velocity: u8) {
        let n = note as i32;
        let freq = 440.0 * 2f32.powf((n as f32 - 69.0) / 12.0);
        self.freq_target = freq;
        if self.glide_time_sec <= 0.0 {
            self.freq_current = freq;
        }
        self.gate = true;
    }

    #[wasm_bindgen]
    pub fn note_off(&mut self, _note: u8) {
        // mono MVP: any note off releases envelope
        self.gate = false;
    }

    #[wasm_bindgen]
    pub fn set_waveform(&mut self, waveform: u32) {
        self.waveform = match waveform {
            0 => Waveform::Sine,
            1 => Waveform::Square,
            2 => Waveform::Sawtooth,
            3 => Waveform::Triangle,
            _ => Waveform::Sine,
        };
    }

    #[wasm_bindgen]
    pub fn set_adsr(&mut self, attack: f32, decay: f32, sustain: f32, release: f32) {
        self.attack = attack.max(0.0);
        self.decay = decay.max(0.0);
        self.sustain = sustain.clamp(0.0, 1.0);
        self.release = release.max(0.0);
    }

    #[wasm_bindgen]
    pub fn set_glide(&mut self, time_ms: f32) {
        self.glide_time_sec = (time_ms / 1000.0).max(0.0);
    }

    #[wasm_bindgen]
    pub fn set_gain(&mut self, gain: f32) {
        self.gain = gain.clamp(0.0, 1.0);
    }

    fn osc_sample(&self, phase: f32) -> f32 {
        match self.waveform {
            Waveform::Sine => phase.sin(),
            Waveform::Square => if phase.sin() > 0.0 { 1.0 } else { -1.0 },
            Waveform::Sawtooth => (phase / std::f32::consts::PI) - 1.0,
            Waveform::Triangle => {
                let t = (phase / (2.0 * std::f32::consts::PI)) % 1.0;
                if t < 0.5 { 4.0 * t - 1.0 } else { 3.0 - 4.0 * t }
            }
        }
    }

    fn advance_env(&mut self) {
        // simple per-sample ADSR
        let dt = 1.0 / self.sample_rate;
        if self.gate {
            if self.env < 1.0 {
                // attack
                if self.attack <= 0.0 {
                    self.env = 1.0;
                } else {
                    self.env += dt / self.attack;
                    if self.env > 1.0 { self.env = 1.0; }
                }
            } else if self.env > self.sustain {
                // decay
                if self.decay <= 0.0 {
                    self.env = self.sustain;
                } else {
                    self.env -= dt * ((1.0 - self.sustain) / self.decay);
                    if self.env < self.sustain { self.env = self.sustain; }
                }
            }
        } else {
            // release
            if self.release <= 0.0 { self.env = 0.0; } else {
                self.env -= dt * (1.0 / self.release);
                if self.env < 0.0 { self.env = 0.0; }
            }
        }
    }

    fn advance_freq(&mut self) {
        if self.glide_time_sec <= 0.0 || (self.freq_current - self.freq_target).abs() < 1e-6 {
            self.freq_current = self.freq_target;
            return;
        }
        let dt = 1.0 / self.sample_rate;
        let step = (self.freq_target - self.freq_current) * (dt / self.glide_time_sec).min(1.0);
        self.freq_current += step;
    }

    #[wasm_bindgen]
    pub fn process(&mut self, output: &mut [f32]) {
        for sample in output.iter_mut() {
            self.advance_freq();
            self.advance_env();

            let phase_inc = 2.0 * std::f32::consts::PI * self.freq_current / self.sample_rate;
            let osc = self.osc_sample(self.phase);
            let s = osc * self.env * self.gain;
            *sample = if s.is_finite() { s } else { 0.0 };

            self.phase += phase_inc;
            if self.phase >= 2.0 * std::f32::consts::PI {
                self.phase -= 2.0 * std::f32::consts::PI;
            }
        }
    }
}
