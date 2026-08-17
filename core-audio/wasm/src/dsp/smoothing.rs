//! Parameter smoothing primitives.
//!
//! Every audible click in a modular graph comes from the same place: a value that
//! changes faster than the signal it multiplies. Parameters arrive from the UI once per
//! render quantum (128 samples), so applying them raw produces a staircase — inaudible
//! for something like filter cutoff, a hard click for anything touching amplitude.
//!
//! `Smoothed` is the workhorse: a one-pole lowpass on the control value, ticked per
//! sample. `snap()` exists for the cases where a jump is correct (initial value, a
//! voice starting from silence) and should be used deliberately.

/// Distance below which a smoother snaps to its target instead of creeping asymptotically.
/// -80 dB on a gain.
const SETTLE_EPSILON: f32 = 1e-4;

/// A one-pole smoothed control value.
///
/// The pole is expressed as a time constant in seconds — the time to cover ~63% of the
/// remaining distance to the target. 5–20 ms is the useful range for gains: fast enough
/// to feel instant, slow enough to stay below the audio band.
#[derive(Clone, Copy)]
pub struct Smoothed {
    current: f32,
    target: f32,
    /// One-pole coefficient, precomputed from the time constant and sample rate.
    coeff: f32,
}

impl Smoothed {
    pub fn new(initial: f32, time_constant_sec: f32, sample_rate: f32) -> Self {
        let mut s = Self {
            current: initial,
            target: initial,
            coeff: 0.0,
        };
        s.set_time_constant(time_constant_sec, sample_rate);
        s
    }

    /// Recompute the pole. `dt / (tau + dt)` is the standard one-pole form; a
    /// non-positive tau degenerates to "no smoothing", which is a legitimate request.
    pub fn set_time_constant(&mut self, time_constant_sec: f32, sample_rate: f32) {
        if sample_rate <= 0.0 {
            self.coeff = 1.0;
            return;
        }
        let dt = 1.0 / sample_rate;
        self.coeff = if time_constant_sec <= 0.0 {
            1.0
        } else {
            dt / (time_constant_sec + dt)
        };
    }

    #[inline]
    pub fn set_target(&mut self, target: f32) {
        if target.is_finite() {
            self.target = target;
        }
    }

    /// Jump straight to a value, bypassing the smoother. For initialisation and for
    /// voices starting from silence, where there is no discontinuity to smooth.
    #[inline]
    pub fn snap(&mut self, value: f32) {
        if value.is_finite() {
            self.current = value;
            self.target = value;
        }
    }

    #[inline]
    pub fn current(&self) -> f32 {
        self.current
    }

    /// True once the smoother has converged. Callers use this to skip per-sample work when a
    /// parameter is at rest — the common case.
    #[inline]
    pub fn is_settled(&self) -> bool {
        self.current == self.target
    }

    /// Advance one sample and return the new value.
    ///
    /// A one-pole approach is asymptotic, so the last stretch is snapped once the remaining
    /// distance drops below SETTLE_EPSILON (-80 dB on a gain — inaudible). Without that a
    /// "faded out" gain would sit at a small non-zero value forever, and callers could never
    /// take the settled fast path.
    #[inline]
    pub fn tick(&mut self) -> f32 {
        let remaining = self.target - self.current;
        if remaining.abs() < SETTLE_EPSILON {
            self.current = self.target;
        } else {
            self.current += remaining * self.coeff;
        }
        self.current
    }
}

/// Soft saturation, used instead of voice-count normalisation in the synth.
///
/// `tanh` would be the textbook choice but is expensive per sample. This cubic
/// approximation is linear (unity gain) below 1/3, curves smoothly to a limit of ±1, and
/// is continuous in the first derivative at both knees — so it adds harmonics gracefully
/// rather than clipping.
#[inline]
pub fn soft_clip(x: f32) -> f32 {
    const THIRD: f32 = 1.0 / 3.0;
    if x >= 1.0 {
        2.0 * THIRD
    } else if x <= -1.0 {
        -2.0 * THIRD
    } else {
        x - (x * x * x) * THIRD
    }
}
