use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct MidiTransposeNode {
    semitones: i32,
    clamp_low: i32,
    clamp_high: i32,
    pass_through_non_note: bool,
}

#[wasm_bindgen]
impl MidiTransposeNode {
    #[wasm_bindgen(constructor)]
    pub fn new() -> MidiTransposeNode {
        MidiTransposeNode {
            semitones: 0,
            clamp_low: 0,
            clamp_high: 127,
            pass_through_non_note: true,
        }
    }

    #[wasm_bindgen]
    pub fn set_params(&mut self, semitones: i32, clamp_low: i32, clamp_high: i32, pass_through_non_note: bool) {
        self.semitones = semitones.clamp(-48, 48); // wider internal, UI may restrict
        self.clamp_low = clamp_low.clamp(0, 127);
        self.clamp_high = clamp_high.clamp(0, 127);
        if self.clamp_low > self.clamp_high { std::mem::swap(&mut self.clamp_low, &mut self.clamp_high); }
        self.pass_through_non_note = pass_through_non_note;
    }

    #[wasm_bindgen]
    pub fn transform(&self, status: u8, data1: u8, data2: u8) -> Box<[u8]> {
        // Note On 0x90-0x9F and Note Off 0x80-0x8F
        let cmd = status & 0xF0;
        if cmd == 0x90 || cmd == 0x80 {
            let mut note = data1 as i32 + self.semitones;
            note = note.clamp(self.clamp_low, self.clamp_high);
            return vec![status, note as u8, data2].into_boxed_slice();
        }
        if self.pass_through_non_note { vec![status, data1, data2].into_boxed_slice() } else { vec![].into_boxed_slice() }
    }
}
