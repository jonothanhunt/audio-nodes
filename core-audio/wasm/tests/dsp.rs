//! Native unit tests for the DSP layer.
//!
//! These pin the click/pop fixes described in `docs/AUDIO-AUDIT.md` sections A4–A8. The
//! central property in almost every case is the same: **no sample-to-sample jump large
//! enough to be heard as a click**, expressed as a bound on the maximum first difference of
//! the output.

use audio_engine::dsp::{soft_clip, Smoothed};
use audio_engine::nodes::{OscillatorNode, ReverbNode, SynthNode};

const SR: f32 = 48_000.0;
const BLOCK: usize = 128;

/// Largest absolute step between consecutive samples.
fn max_step(samples: &[f32]) -> f32 {
    samples
        .windows(2)
        .map(|w| (w[1] - w[0]).abs())
        .fold(0.0f32, f32::max)
}

fn peak(samples: &[f32]) -> f32 {
    samples.iter().fold(0.0f32, |acc, s| acc.max(s.abs()))
}

/// Render `blocks` quanta and return the whole signal.
fn render(node: &mut SynthNode, blocks: usize) -> Vec<f32> {
    let mut all = Vec::with_capacity(blocks * BLOCK);
    let mut buf = vec![0.0f32; BLOCK];
    for _ in 0..blocks {
        buf.iter_mut().for_each(|s| *s = 0.0);
        node.process(&mut buf);
        all.extend_from_slice(&buf);
    }
    all
}

// ---------------------------------------------------------------------------
// Smoothed
// ---------------------------------------------------------------------------

mod smoothing {
    use super::*;

    #[test]
    fn starts_at_its_initial_value() {
        let s = Smoothed::new(0.75, 0.01, SR);
        assert_eq!(s.current(), 0.75);
        assert!(s.is_settled());
    }

    #[test]
    fn approaches_the_target_without_jumping_to_it() {
        let mut s = Smoothed::new(0.0, 0.01, SR);
        s.set_target(1.0);
        let first = s.tick();
        assert!(first > 0.0, "should start moving");
        assert!(first < 0.05, "must not jump to the target in one sample");
    }

    #[test]
    fn covers_most_of_the_distance_in_one_time_constant() {
        let tau = 0.01;
        let mut s = Smoothed::new(0.0, tau, SR);
        s.set_target(1.0);
        for _ in 0..(tau * SR) as usize {
            s.tick();
        }
        // One time constant is ~63% by definition.
        assert!((s.current() - 0.63).abs() < 0.02, "got {}", s.current());
    }

    #[test]
    fn settles_within_a_few_time_constants() {
        let mut s = Smoothed::new(0.0, 0.005, SR);
        s.set_target(1.0);
        for _ in 0..(0.05 * SR) as usize {
            s.tick();
        }
        assert!(s.is_settled(), "still at {}", s.current());
    }

    #[test]
    fn snap_bypasses_the_ramp() {
        let mut s = Smoothed::new(0.0, 0.01, SR);
        s.snap(1.0);
        assert_eq!(s.current(), 1.0);
        assert!(s.is_settled());
    }

    #[test]
    fn ignores_non_finite_targets() {
        let mut s = Smoothed::new(0.5, 0.01, SR);
        s.set_target(f32::NAN);
        s.set_target(f32::INFINITY);
        for _ in 0..100 {
            assert!(s.tick().is_finite());
        }
        assert_eq!(s.current(), 0.5);
    }

    #[test]
    fn a_zero_time_constant_means_no_smoothing() {
        let mut s = Smoothed::new(0.0, 0.0, SR);
        s.set_target(1.0);
        assert_eq!(s.tick(), 1.0);
    }
}

// ---------------------------------------------------------------------------
// soft_clip (A5)
// ---------------------------------------------------------------------------

mod soft_clipping {
    use super::*;

    #[test]
    fn is_near_unity_for_small_signals() {
        for x in [-0.1f32, -0.01, 0.0, 0.01, 0.1] {
            assert!((soft_clip(x) - x).abs() < 0.005, "x = {x}");
        }
    }

    #[test]
    fn is_bounded_for_any_input() {
        for x in [-100.0f32, -3.0, -1.0, 1.0, 3.0, 100.0] {
            assert!(soft_clip(x).abs() <= 2.0 / 3.0 + 1e-6, "x = {x}");
        }
    }

    #[test]
    fn is_monotonic_and_continuous_through_the_knee() {
        let mut prev = soft_clip(-1.5);
        let mut max_jump = 0.0f32;
        for i in 0..=3000 {
            let x = -1.5 + (i as f32) * 0.001;
            let y = soft_clip(x);
            assert!(y >= prev - 1e-6, "not monotonic at x = {x}");
            max_jump = max_jump.max((y - prev).abs());
            prev = y;
        }
        // A hard clip would show a slope discontinuity; this stays smooth.
        assert!(max_jump < 0.002, "max jump {max_jump}");
    }

    #[test]
    fn is_odd_symmetric() {
        for x in [0.25f32, 0.5, 0.9, 2.0] {
            assert!((soft_clip(x) + soft_clip(-x)).abs() < 1e-6, "x = {x}");
        }
    }
}

// ---------------------------------------------------------------------------
// SynthNode (A4, A5, A6)
// ---------------------------------------------------------------------------

mod synth {
    use super::*;

    fn synth() -> SynthNode {
        let mut s = SynthNode::new(SR);
        s.set_adsr(0.005, 0.05, 0.7, 0.05);
        s.set_gain(1.0);
        s
    }

    #[test]
    fn is_silent_before_any_note() {
        let mut s = synth();
        let out = render(&mut s, 4);
        assert_eq!(peak(&out), 0.0);
        assert!(!s.is_active());
    }

    #[test]
    fn reports_active_while_a_note_is_held_and_idle_after_release() {
        let mut s = synth();
        s.note_on(60, 100);
        render(&mut s, 2);
        assert!(s.is_active());

        s.note_off(60);
        render(&mut s, 60); // well past the 50 ms release
        assert!(!s.is_active(), "voice should have been reclaimed");
    }

    #[test]
    fn a4_retrigger_does_not_drop_the_envelope_to_zero() {
        let mut s = synth();
        s.note_on(60, 127);
        // Let the envelope reach the sustain level.
        render(&mut s, 40);

        // Retriggering the same note used to reset `env` to 0 — a full-amplitude step down
        // on a voice that was sounding at sustain, i.e. an audible click.
        s.note_on(60, 127);
        let after = render(&mut s, 1);
        assert!(
            max_step(&after) < 0.05,
            "retrigger produced a step of {}",
            max_step(&after)
        );
        assert!(peak(&after) > 0.1, "voice should still be sounding");
    }

    #[test]
    fn a4_voice_stealing_fades_the_old_note_instead_of_cutting_it() {
        let mut s = synth();
        s.set_max_voices(2);
        s.note_on(60, 127);
        s.note_on(64, 127);
        render(&mut s, 40);

        // A third note has to steal a voice. The old note is ramped out over ~2 ms rather
        // than being zeroed with its phase reset.
        s.note_on(67, 127);
        let after = render(&mut s, 4);
        assert!(
            max_step(&after) < 0.1,
            "voice steal produced a step of {}",
            max_step(&after)
        );
    }

    #[test]
    fn a4_a_stolen_voice_actually_plays_the_new_note() {
        let mut s = synth();
        s.set_max_voices(1);
        s.note_on(60, 127);
        render(&mut s, 20);
        s.note_on(72, 127);
        // Long enough for the steal fade to finish and the new note to attack.
        let after = render(&mut s, 40);
        assert!(peak(&after) > 0.1, "the stealing note never sounded");
        assert!(s.is_active());
    }

    #[test]
    fn a5_a_single_note_is_not_quieter_when_others_join() {
        let mut s = synth();
        s.set_gain(0.25); // keep the sum below the soft clipper's knee
        s.note_on(60, 127);
        let solo = peak(&render(&mut s, 60));

        // Under the old 1/voice_count normalisation, adding notes ducked the ones already
        // sounding. The first note's contribution must not shrink.
        s.note_on(64, 127);
        s.note_on(67, 127);
        s.note_on(71, 127);
        let chord = peak(&render(&mut s, 60));

        assert!(
            chord >= solo * 0.9,
            "chord peak {chord} collapsed relative to solo {solo}"
        );
    }

    #[test]
    fn a5_a_large_chord_stays_bounded() {
        let mut s = synth();
        s.set_gain(1.0);
        for note in [48, 52, 55, 59, 60, 64, 67, 71] {
            s.note_on(note, 127);
        }
        let out = render(&mut s, 80);
        assert!(peak(&out) <= 1.0, "output exceeded full scale: {}", peak(&out));
        assert!(out.iter().all(|s| s.is_finite()));
    }

    #[test]
    fn a6_a_zero_length_release_still_ramps() {
        let mut s = synth();
        s.set_adsr(0.0, 0.0, 1.0, 0.0);
        s.note_on(60, 127);
        render(&mut s, 20);

        // A literal zero-length release is an instant jump to silence. The stage floor turns
        // it into a very fast but band-limited ramp.
        s.note_off(60);
        let after = render(&mut s, 2);
        assert!(
            max_step(&after) < 0.2,
            "zero-length release stepped by {}",
            max_step(&after)
        );
    }

    #[test]
    fn a6_a_zero_length_attack_still_ramps() {
        let mut s = synth();
        s.set_adsr(0.0, 0.1, 0.7, 0.1);
        s.note_on(60, 127);
        let out = render(&mut s, 2);
        assert!(
            max_step(&out) < 0.2,
            "zero-length attack stepped by {}",
            max_step(&out)
        );
    }

    #[test]
    fn note_off_is_ignored_for_a_note_that_is_not_held() {
        let mut s = synth();
        s.note_on(60, 100);
        render(&mut s, 10);
        s.note_off(61); // different note
        assert!(s.is_active());
    }

    #[test]
    fn sustain_pedal_holds_notes_through_note_off() {
        let mut s = synth();
        s.sustain_pedal(true);
        s.note_on(60, 100);
        render(&mut s, 10);
        s.note_off(60);
        render(&mut s, 60);
        assert!(s.is_active(), "pedal should have held the note");

        s.sustain_pedal(false);
        render(&mut s, 60);
        assert!(!s.is_active(), "releasing the pedal should release the note");
    }

    #[test]
    fn velocity_scales_the_output() {
        let mut quiet = synth();
        quiet.note_on(60, 32);
        let quiet_peak = peak(&render(&mut quiet, 60));

        let mut loud = synth();
        loud.note_on(60, 127);
        let loud_peak = peak(&render(&mut loud, 60));

        assert!(loud_peak > quiet_peak * 2.0, "{loud_peak} vs {quiet_peak}");
    }

    #[test]
    fn output_stays_finite_across_every_waveform() {
        for waveform in 0..4u32 {
            let mut s = synth();
            s.set_waveform(waveform);
            s.note_on(60, 127);
            let out = render(&mut s, 20);
            assert!(
                out.iter().all(|v| v.is_finite()),
                "waveform {waveform} produced non-finite output"
            );
        }
    }

    #[test]
    fn shrinking_the_voice_count_does_not_panic() {
        let mut s = synth();
        for note in 60..68 {
            s.note_on(note, 100);
        }
        render(&mut s, 5);
        s.set_max_voices(2);
        let out = render(&mut s, 5);
        assert!(out.iter().all(|v| v.is_finite()));
    }
}

// ---------------------------------------------------------------------------
// OscillatorNode (A7)
// ---------------------------------------------------------------------------

mod oscillator {
    use super::*;

    fn render_osc(node: &mut OscillatorNode, blocks: usize) -> Vec<f32> {
        let mut all = Vec::with_capacity(blocks * BLOCK);
        let mut buf = vec![0.0f32; BLOCK];
        for _ in 0..blocks {
            node.process(&mut buf);
            all.extend_from_slice(&buf);
        }
        all
    }

    #[test]
    fn a7_an_amplitude_change_ramps_rather_than_stepping() {
        let mut osc = OscillatorNode::new(SR);
        osc.set_frequency(100.0);
        osc.set_amplitude(0.0);
        render_osc(&mut osc, 20); // settle at silence

        osc.set_amplitude(1.0);
        let after = render_osc(&mut osc, 1);
        // The first sample must not already be at full amplitude.
        assert!(
            after[0].abs() < 0.2,
            "amplitude jumped to {} in one sample",
            after[0]
        );
    }

    #[test]
    fn a7_amplitude_reaches_its_target() {
        let mut osc = OscillatorNode::new(SR);
        osc.set_frequency(1000.0);
        osc.set_amplitude(1.0);
        let out = render_osc(&mut osc, 40);
        assert!(peak(&out) > 0.9, "never reached full amplitude: {}", peak(&out));
    }

    #[test]
    fn a7_a_frequency_jump_does_not_break_the_waveform() {
        let mut osc = OscillatorNode::new(SR);
        osc.set_amplitude(1.0);
        osc.set_frequency(100.0);
        render_osc(&mut osc, 20);

        // A big frequency step is a discontinuity in phase *slope*. Smoothing keeps the
        // sample-to-sample delta bounded through the transition.
        osc.set_frequency(2000.0);
        let after = render_osc(&mut osc, 2);
        let expected_max_step = 2.0 * std::f32::consts::PI * 2000.0 / SR * 1.5;
        assert!(
            max_step(&after) < expected_max_step.max(0.5),
            "frequency change stepped by {}",
            max_step(&after)
        );
    }

    #[test]
    fn amplitude_is_clamped_to_unity() {
        let mut osc = OscillatorNode::new(SR);
        osc.set_amplitude(5.0);
        let out = render_osc(&mut osc, 40);
        assert!(peak(&out) <= 1.0 + 1e-6, "peak {}", peak(&out));
    }

    #[test]
    fn stays_finite_across_every_waveform() {
        for waveform in 0..4u32 {
            let mut osc = OscillatorNode::new(SR);
            osc.set_waveform(waveform);
            osc.set_amplitude(1.0);
            osc.set_frequency(440.0);
            let out = render_osc(&mut osc, 20);
            assert!(
                out.iter().all(|v| v.is_finite()),
                "waveform {waveform} produced non-finite output"
            );
        }
    }
}

// ---------------------------------------------------------------------------
// ReverbNode (A8)
// ---------------------------------------------------------------------------

mod reverb {
    use super::*;

    #[test]
    fn a8_a_wet_mix_change_ramps_rather_than_stepping() {
        let mut rev = ReverbNode::new(SR);
        rev.set_wet_mix(0.0);
        rev.set_feedback(0.0);

        let input = vec![1.0f32; BLOCK];
        let mut out = vec![0.0f32; BLOCK];
        rev.process(&input, &mut out); // settle dry

        // Jumping the wet mix used to step the dry/wet balance on a block boundary.
        rev.set_wet_mix(1.0);
        rev.process(&input, &mut out);
        assert!(
            max_step(&out) < 0.05,
            "wet mix change stepped by {}",
            max_step(&out)
        );
    }

    #[test]
    fn a8_wet_mix_reaches_its_target() {
        let mut rev = ReverbNode::new(SR);
        rev.set_wet_mix(1.0);
        let input = vec![1.0f32; BLOCK];
        let mut out = vec![0.0f32; BLOCK];
        for _ in 0..40 {
            rev.process(&input, &mut out);
        }
        assert!((rev.wet_mix() - 1.0).abs() < 1e-3, "wet mix {}", rev.wet_mix());
    }

    #[test]
    fn reports_a_tail_after_signal_then_decays_to_nothing() {
        let mut rev = ReverbNode::new(SR);
        rev.set_feedback(0.5);
        rev.set_wet_mix(1.0);

        let input = vec![1.0f32; BLOCK];
        let mut out = vec![0.0f32; BLOCK];
        for _ in 0..20 {
            rev.process(&input, &mut out);
        }
        assert!(rev.tail_peak() > 0.0, "delay line should hold signal");

        // Feed silence: the tail must decay, which is what lets the worklet know when a
        // disconnected reverb is safe to drop.
        let silence = vec![0.0f32; BLOCK];
        let before = rev.tail_peak();
        for _ in 0..400 {
            rev.process(&silence, &mut out);
        }
        assert!(rev.tail_peak() < before, "tail did not decay");
    }

    #[test]
    fn feedback_is_clamped_below_unity() {
        let mut rev = ReverbNode::new(SR);
        rev.set_feedback(10.0);
        assert!(rev.feedback() <= 0.95 + 1e-6);
    }

    #[test]
    fn a_non_finite_input_does_not_poison_the_delay_line() {
        let mut rev = ReverbNode::new(SR);
        rev.set_feedback(0.9);
        rev.set_wet_mix(1.0);

        let mut input = vec![0.5f32; BLOCK];
        input[10] = f32::NAN;
        input[20] = f32::INFINITY;
        let mut out = vec![0.0f32; BLOCK];
        rev.process(&input, &mut out);

        let clean = vec![0.0f32; BLOCK];
        for _ in 0..10 {
            rev.process(&clean, &mut out);
            assert!(
                out.iter().all(|v| v.is_finite()),
                "NaN leaked into the feedback path"
            );
        }
    }
}
