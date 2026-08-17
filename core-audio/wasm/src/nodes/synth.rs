use crate::dsp::{soft_clip, OscillatorCore, Waveform};
use wasm_bindgen::prelude::*;

/// Envelope stage times shorter than this are clamped. A literal zero-length stage is an
/// instantaneous jump in amplitude, i.e. a click; 1.5 ms still reads as "instant" musically
/// but stays band-limited.
const MIN_STAGE_SEC: f32 = 0.0015;

/// How long a stolen voice gets to fade out before the new note takes it over.
/// Short enough not to delay the new note perceptibly, long enough to avoid a click.
const STEAL_FADE_SEC: f32 = 0.002;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Stage {
    /// Not sounding and not reserved.
    Idle,
    /// Sounding (attack/decay/sustain if gated, release if not).
    Active,
    /// Being stolen: fading the old note out, `pending_*` holds the note waiting for it.
    Stealing,
}

#[derive(Clone, Copy)]
struct Voice {
    note: u8,
    stage: Stage,
    key_down: bool, // physical key state
    gate: bool,     // envelope gate (may remain true while sustain pedal held)
    freq_target: f32,
    freq_current: f32,
    env: f32,
    core: OscillatorCore,
    velocity: f32, // 0..1

    // Set while `stage == Stealing`.
    pending_note: u8,
    pending_velocity: f32,
}

impl Voice {
    fn new() -> Self {
        Self {
            note: 0,
            stage: Stage::Idle,
            key_down: false,
            gate: false,
            freq_target: 0.0,
            freq_current: 0.0,
            env: 0.0,
            core: OscillatorCore::new(),
            velocity: 0.0,
            pending_note: 0,
            pending_velocity: 0.0,
        }
    }

    #[inline]
    fn is_sounding(&self) -> bool {
        self.stage != Stage::Idle || self.env > 0.0
    }

    /// Start a note on a voice that is known to be silent. Resetting the phase here is
    /// safe (and desirable — it makes attacks consistent) precisely because there is no
    /// signal to discontinue.
    fn start_from_silence(&mut self, note: u8, freq: f32, velocity: f32, glide: bool) {
        self.note = note;
        self.stage = Stage::Active;
        self.key_down = true;
        self.gate = true;
        self.freq_target = freq;
        self.freq_current = if glide {
            self.freq_current.max(20.0)
        } else {
            freq
        };
        self.env = 0.0;
        self.core.phase = 0.0;
        self.velocity = velocity;
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
    // Glide (seconds)
    glide_time_sec: f32,
    // Polyphony
    max_voices: usize,
    voices: Vec<Voice>,
    // Sustain pedal state
    sustain_pedal: bool,
    /// Per-sample envelope decrement applied to a voice being stolen.
    steal_step: f32,
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
            sustain_pedal: false,
            steal_step: 1.0 / (STEAL_FADE_SEC * sample_rate).max(1.0),
        }
    }

    #[wasm_bindgen]
    pub fn note_on(&mut self, note: u8, velocity: u8) {
        let freq = midi_to_freq(note);
        let vel = (velocity as f32 / 127.0).clamp(0.0, 1.0);
        let glide = self.glide_time_sec > 0.0;

        // Retrigger: the same note is already sounding. Re-gate and let the envelope
        // continue from where it is. Zeroing `env` here would drop a voice sitting at
        // sustain level straight to silence, which is one of the loudest clicks the synth
        // can make — and resetting the phase on a ringing voice adds a second one.
        if let Some(v) = self
            .voices
            .iter_mut()
            .find(|v| v.stage == Stage::Active && v.note == note)
        {
            v.key_down = true;
            v.gate = true;
            v.velocity = vel;
            v.freq_target = freq;
            if !glide {
                v.freq_current = freq;
            }
            return;
        }

        // A genuinely free voice: safe to start from zero.
        if let Some(v) = self.voices.iter_mut().find(|v| !v.is_sounding()) {
            v.start_from_silence(note, freq, vel, glide);
            return;
        }

        // All voices busy. Steal the quietest one, but fade it out over STEAL_FADE_SEC
        // first rather than cutting it dead. Voices already being stolen are skipped so a
        // fast run of notes does not repeatedly restart the same fade.
        let victim = self
            .voices
            .iter_mut()
            .filter(|v| v.stage != Stage::Stealing)
            .min_by(|a, b| a.env.total_cmp(&b.env));

        let Some(v) = victim else {
            // Every voice is mid-steal already; drop the note rather than glitch one.
            return;
        };

        v.stage = Stage::Stealing;
        v.gate = false;
        v.key_down = false;
        v.pending_note = note;
        v.pending_velocity = vel;
    }

    #[wasm_bindgen]
    pub fn note_off(&mut self, note: u8) {
        for v in self
            .voices
            .iter_mut()
            .filter(|v| v.stage == Stage::Active && v.note == note)
        {
            v.key_down = false;
            if !self.sustain_pedal {
                v.gate = false;
            }
        }
    }

    #[wasm_bindgen]
    pub fn sustain_pedal(&mut self, down: bool) {
        if self.sustain_pedal == down {
            return;
        }
        self.sustain_pedal = down;
        if !down {
            // Pedal released: any voices with key up should release now
            for v in self.voices.iter_mut() {
                if !v.key_down {
                    v.gate = false;
                }
            }
        }
    }

    #[wasm_bindgen]
    pub fn set_waveform(&mut self, waveform: u32) {
        let w = waveform_from_index(waveform);
        self.waveform = w;
        for v in self.voices.iter_mut() {
            v.core.set_waveform(w);
        }
    }

    #[wasm_bindgen]
    pub fn set_adsr(&mut self, attack: f32, decay: f32, sustain: f32, release: f32) {
        self.attack = attack.max(MIN_STAGE_SEC);
        self.decay = decay.max(MIN_STAGE_SEC);
        self.sustain = sustain.clamp(0.0, 1.0);
        self.release = release.max(MIN_STAGE_SEC);
    }

    #[wasm_bindgen]
    pub fn set_glide(&mut self, time_ms: f32) {
        self.glide_time_sec = (time_ms / 1000.0).max(0.0);
    }

    #[wasm_bindgen]
    pub fn set_gain(&mut self, gain: f32) {
        self.gain = gain.clamp(0.0, 1.0);
    }

    #[wasm_bindgen]
    pub fn set_max_voices(&mut self, max: u32) {
        let max = max.clamp(1, 32) as usize;
        if max == self.max_voices {
            return;
        }
        self.max_voices = max;
        self.voices.resize_with(max, Voice::new);
    }

    /// True while any voice is still producing signal. The worklet uses this to know when
    /// a synth has gone quiet, so a removed node's release tail can ring out before the
    /// instance is dropped.
    #[wasm_bindgen]
    pub fn is_active(&self) -> bool {
        self.voices.iter().any(|v| v.is_sounding())
    }

    #[wasm_bindgen]
    pub fn process(&mut self, output: &mut [f32]) {
        let dt = 1.0 / self.sample_rate;
        let attack_step = dt / self.attack;
        let decay_step = dt * ((1.0 - self.sustain) / self.decay);
        let release_step = dt * (1.0 / self.release);
        let glide_ratio = if self.glide_time_sec > 0.0 {
            (dt / self.glide_time_sec).min(1.0)
        } else {
            1.0
        };

        for sample in output.iter_mut() {
            let mut acc = 0.0f32;

            for v in self.voices.iter_mut() {
                if v.stage == Stage::Idle && v.env <= 0.0 {
                    continue;
                }

                // Glide toward the target frequency.
                if glide_ratio >= 1.0 || (v.freq_current - v.freq_target).abs() < 1e-6 {
                    v.freq_current = v.freq_target;
                } else {
                    v.freq_current += (v.freq_target - v.freq_current) * glide_ratio;
                }

                if v.stage == Stage::Stealing {
                    // Fade the outgoing note out, then hand the voice to the note that
                    // was waiting for it.
                    v.env -= self.steal_step;
                    if v.env <= 0.0 {
                        let note = v.pending_note;
                        let vel = v.pending_velocity;
                        v.env = 0.0;
                        v.start_from_silence(
                            note,
                            midi_to_freq(note),
                            vel,
                            self.glide_time_sec > 0.0,
                        );
                    }
                } else if v.gate {
                    // Attack to 1.0, then decay to the sustain level.
                    if v.env < 1.0 {
                        v.env = (v.env + attack_step).min(1.0);
                    } else if v.env > self.sustain {
                        v.env = (v.env - decay_step).max(self.sustain);
                    }
                } else {
                    v.env -= release_step;
                    if v.env <= 0.0 {
                        v.env = 0.0;
                        v.stage = Stage::Idle;
                    }
                }

                let osc = v.core.tick(v.freq_current, self.sample_rate);
                acc += osc * v.env * v.velocity;
            }

            // Fixed per-voice level with soft saturation on the sum, rather than dividing
            // by the live voice count. Normalising by voice count made every note on/off
            // change the loudness of every other sounding note (audible as pumping on
            // chords); saturating instead keeps each note's level stable and lets the sum
            // compress gracefully when a big chord is held.
            let s = soft_clip(acc * self.gain);
            *sample = if s.is_finite() { s } else { 0.0 };
        }
    }
}

fn waveform_from_index(index: u32) -> Waveform {
    match index {
        0 => Waveform::Sine,
        1 => Waveform::Square,
        2 => Waveform::Sawtooth,
        3 => Waveform::Triangle,
        _ => Waveform::Sine,
    }
}

fn midi_to_freq(note: u8) -> f32 {
    440.0 * 2f32.powf((note as f32 - 69.0) / 12.0)
}
