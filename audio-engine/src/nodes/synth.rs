use wasm_bindgen::prelude::*;

#[derive(Clone, Copy)]
pub enum Waveform {
    Sine,
    Square,
    Sawtooth,
    Triangle,
}

#[derive(Clone, Copy)]
struct Voice {
    note: u8,
    active: bool,
    gate: bool,
    freq_target: f32,
    freq_current: f32,
    env: f32,
    phase: f32,
}

impl Voice {
    fn new() -> Self {
        Self {
            note: 0,
            active: false,
            gate: false,
            freq_target: 0.0,
            freq_current: 0.0,
            env: 0.0,
            phase: 0.0,
        }
    }
}

#[wasm_bindgen]
pub struct SynthNode {
    sample_rate: f32,
    waveform: Waveform,
    gain: f32,
    // ADSR
    attack: f32,
    decay: f32,
    sustain: f32,
    release: f32,
    // Glide (ms)
    glide_time_sec: f32,
    // Polyphony
    max_voices: usize,
    voices: Vec<Voice>,
}

#[wasm_bindgen]
impl SynthNode {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> SynthNode {
        let max_voices = 8usize;
        SynthNode {
            sample_rate,
            waveform: Waveform::Sawtooth,
            gain: 0.5,
            attack: 0.005,
            decay: 0.12,
            sustain: 0.7,
            release: 0.12,
            glide_time_sec: 0.0,
            max_voices,
            voices: vec![Voice::new(); max_voices],
        }
    }

    #[wasm_bindgen]
    pub fn note_on(&mut self, note: u8, _velocity: u8) {
        let freq = midi_to_freq(note);
        // Reuse voice with same note if present
        if let Some(v) = self.voices.iter_mut().find(|v| v.active && v.note == note) {
            v.gate = true;
            v.freq_target = freq;
            if self.glide_time_sec <= 0.0 {
                v.freq_current = freq;
            }
            v.env = 0.0; // retrigger
            return;
        }
        // Find free voice
        if let Some(v) = self.voices.iter_mut().find(|v| !v.active) {
            v.note = note;
            v.active = true;
            v.gate = true;
            v.freq_target = freq;
            v.freq_current = if self.glide_time_sec <= 0.0 { freq } else { v.freq_current.max(20.0) };
            v.env = 0.0;
            v.phase = 0.0;
            return;
        }
        // Steal the quietest voice (lowest env)
        if let Some((idx, _)) = self.voices
            .iter()
            .enumerate()
            .min_by(|a, b| a.1.env.partial_cmp(&b.1.env).unwrap())
        {
            let v = &mut self.voices[idx];
            v.note = note;
            v.active = true;
            v.gate = true;
            v.freq_target = freq;
            v.freq_current = if self.glide_time_sec <= 0.0 { freq } else { v.freq_current.max(20.0) };
            v.env = 0.0;
            v.phase = 0.0;
        }
    }

    #[wasm_bindgen]
    pub fn note_off(&mut self, note: u8) {
        for v in self.voices.iter_mut().filter(|v| v.active && v.note == note) {
            v.gate = false;
        }
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

    // Optional: allow changing polyphony in the future (not used by TS yet)
    #[wasm_bindgen]
    pub fn set_max_voices(&mut self, max: u32) {
        let max = max.clamp(1, 32) as usize;
        if max == self.max_voices { return; }
        self.max_voices = max;
        self.voices.resize_with(max, Voice::new);
    }

    #[wasm_bindgen]
    pub fn process(&mut self, output: &mut [f32]) {
        let dt = 1.0 / self.sample_rate;
        for sample in output.iter_mut() {
            let mut acc = 0.0f32;
            let mut active_count = 0usize;
            for v in self.voices.iter_mut() {
                if !v.active && v.env <= 0.0 { continue; }
                // Glide
                if self.glide_time_sec <= 0.0 || (v.freq_current - v.freq_target).abs() < 1e-6 {
                    v.freq_current = v.freq_target;
                } else {
                    let step = (v.freq_target - v.freq_current) * (dt / self.glide_time_sec).min(1.0);
                    v.freq_current += step;
                }
                // ADSR
                if v.gate {
                    if v.env < 1.0 {
                        if self.attack <= 0.0 { v.env = 1.0; } else { v.env += dt / self.attack; if v.env > 1.0 { v.env = 1.0; } }
                    } else if v.env > self.sustain {
                        if self.decay <= 0.0 { v.env = self.sustain; } else { v.env -= dt * ((1.0 - self.sustain) / self.decay); if v.env < self.sustain { v.env = self.sustain; } }
                    }
                } else {
                    if self.release <= 0.0 { v.env = 0.0; } else { v.env -= dt * (1.0 / self.release); if v.env < 0.0 { v.env = 0.0; } }
                    if v.env <= 0.0 { v.active = false; }
                }
                // Osc
                let phase_inc = 2.0 * std::f32::consts::PI * v.freq_current / self.sample_rate;
                let osc = match self.waveform {
                    Waveform::Sine => v.phase.sin(),
                    Waveform::Square => if v.phase.sin() > 0.0 { 1.0 } else { -1.0 },
                    Waveform::Sawtooth => (v.phase / std::f32::consts::PI) - 1.0,
                    Waveform::Triangle => {
                        let t = (v.phase / (2.0 * std::f32::consts::PI)) % 1.0;
                        if t < 0.5 { 4.0 * t - 1.0 } else { 3.0 - 4.0 * t }
                    }
                };
                acc += osc * v.env;
                v.phase += phase_inc;
                if v.phase >= 2.0 * std::f32::consts::PI { v.phase -= 2.0 * std::f32::consts::PI; }
                if v.active || v.env > 0.0 { active_count += 1; }
            }
            let norm = if active_count > 0 { 1.0 / active_count as f32 } else { 1.0 };
            let s = acc * self.gain * norm;
            *sample = if s.is_finite() { s } else { 0.0 };
        }
    }
}

fn midi_to_freq(note: u8) -> f32 {
    let n = note as i32;
    440.0 * 2f32.powf((n as f32 - 69.0) / 12.0)
}
