pub mod oscillator_core;
pub mod smoothing;

pub use oscillator_core::{OscillatorCore, Waveform};
pub use smoothing::{soft_clip, Smoothed};
