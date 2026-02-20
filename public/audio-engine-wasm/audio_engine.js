/* @ts-self-types="./audio_engine.d.ts" */

export class AudioEngine {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AudioEngineFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_audioengine_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get buffer_size() {
        const ret = wasm.audioengine_buffer_size(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} sample_rate
     */
    constructor(sample_rate) {
        const ret = wasm.audioengine_new(sample_rate);
        this.__wbg_ptr = ret >>> 0;
        AudioEngineFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {Float32Array} output
     */
    process_audio(output) {
        var ptr0 = passArrayF32ToWasm0(output, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.audioengine_process_audio(this.__wbg_ptr, ptr0, len0, output);
    }
    /**
     * @returns {number}
     */
    get sample_rate() {
        const ret = wasm.audioengine_sample_rate(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) AudioEngine.prototype[Symbol.dispose] = AudioEngine.prototype.free;

export class LfoNode {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        LfoNodeFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_lfonode_free(ptr, 0);
    }
    /**
     * @param {number} sample_rate
     */
    constructor(sample_rate) {
        const ret = wasm.lfonode_new(sample_rate);
        this.__wbg_ptr = ret >>> 0;
        LfoNodeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} block_samples
     * @param {number} bpm
     * @returns {number}
     */
    next_value(block_samples, bpm) {
        const ret = wasm.lfonode_next_value(this.__wbg_ptr, block_samples, bpm);
        return ret;
    }
    /**
     * @param {number} beats_per_cycle
     * @param {number} waveform_index
     * @param {number} phase_offset
     */
    set_params(beats_per_cycle, waveform_index, phase_offset) {
        wasm.lfonode_set_params(this.__wbg_ptr, beats_per_cycle, waveform_index, phase_offset);
    }
}
if (Symbol.dispose) LfoNode.prototype[Symbol.dispose] = LfoNode.prototype.free;

export class MidiTransposeNode {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MidiTransposeNodeFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_miditransposenode_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.miditransposenode_new();
        this.__wbg_ptr = ret >>> 0;
        MidiTransposeNodeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} semitones
     * @param {number} clamp_low
     * @param {number} clamp_high
     * @param {boolean} pass_through_non_note
     */
    set_params(semitones, clamp_low, clamp_high, pass_through_non_note) {
        wasm.miditransposenode_set_params(this.__wbg_ptr, semitones, clamp_low, clamp_high, pass_through_non_note);
    }
    /**
     * @param {number} status
     * @param {number} data1
     * @param {number} data2
     * @returns {Uint8Array}
     */
    transform(status, data1, data2) {
        const ret = wasm.miditransposenode_transform(this.__wbg_ptr, status, data1, data2);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
}
if (Symbol.dispose) MidiTransposeNode.prototype[Symbol.dispose] = MidiTransposeNode.prototype.free;

export class OscillatorNode {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        OscillatorNodeFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_oscillatornode_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get amplitude() {
        const ret = wasm.oscillatornode_amplitude(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get frequency() {
        const ret = wasm.oscillatornode_frequency(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} sample_rate
     */
    constructor(sample_rate) {
        const ret = wasm.oscillatornode_new(sample_rate);
        this.__wbg_ptr = ret >>> 0;
        OscillatorNodeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {Float32Array} output
     */
    process(output) {
        var ptr0 = passArrayF32ToWasm0(output, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.oscillatornode_process(this.__wbg_ptr, ptr0, len0, output);
    }
    /**
     * @param {number} amp
     */
    set amplitude(amp) {
        wasm.oscillatornode_set_amplitude(this.__wbg_ptr, amp);
    }
    /**
     * @param {number} freq
     */
    set frequency(freq) {
        wasm.oscillatornode_set_frequency(this.__wbg_ptr, freq);
    }
    /**
     * @param {number} waveform
     */
    set_waveform(waveform) {
        wasm.oscillatornode_set_waveform(this.__wbg_ptr, waveform);
    }
}
if (Symbol.dispose) OscillatorNode.prototype[Symbol.dispose] = OscillatorNode.prototype.free;

export class ReverbNode {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ReverbNodeFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_reverbnode_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get feedback() {
        const ret = wasm.reverbnode_feedback(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} sample_rate
     */
    constructor(sample_rate) {
        const ret = wasm.reverbnode_new(sample_rate);
        this.__wbg_ptr = ret >>> 0;
        ReverbNodeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {Float32Array} input
     * @param {Float32Array} output
     */
    process(input, output) {
        const ptr0 = passArrayF32ToWasm0(input, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = passArrayF32ToWasm0(output, wasm.__wbindgen_malloc);
        var len1 = WASM_VECTOR_LEN;
        wasm.reverbnode_process(this.__wbg_ptr, ptr0, len0, ptr1, len1, output);
    }
    /**
     * @param {number} feedback
     */
    set feedback(feedback) {
        wasm.reverbnode_set_feedback(this.__wbg_ptr, feedback);
    }
    /**
     * @param {number} wet_mix
     */
    set wet_mix(wet_mix) {
        wasm.reverbnode_set_wet_mix(this.__wbg_ptr, wet_mix);
    }
    /**
     * @returns {number}
     */
    get wet_mix() {
        const ret = wasm.reverbnode_wet_mix(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) ReverbNode.prototype[Symbol.dispose] = ReverbNode.prototype.free;

export class SpeakerNode {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SpeakerNodeFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_speakernode_free(ptr, 0);
    }
    /**
     * @returns {boolean}
     */
    get muted() {
        const ret = wasm.speakernode_muted(this.__wbg_ptr);
        return ret !== 0;
    }
    constructor() {
        const ret = wasm.speakernode_new();
        this.__wbg_ptr = ret >>> 0;
        SpeakerNodeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {Float32Array} input
     * @param {Float32Array} output
     */
    process(input, output) {
        const ptr0 = passArrayF32ToWasm0(input, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = passArrayF32ToWasm0(output, wasm.__wbindgen_malloc);
        var len1 = WASM_VECTOR_LEN;
        wasm.speakernode_process(this.__wbg_ptr, ptr0, len0, ptr1, len1, output);
    }
    /**
     * @param {boolean} muted
     */
    set muted(muted) {
        wasm.speakernode_set_muted(this.__wbg_ptr, muted);
    }
    /**
     * @param {number} volume
     */
    set volume(volume) {
        wasm.speakernode_set_volume(this.__wbg_ptr, volume);
    }
    /**
     * @returns {number}
     */
    get volume() {
        const ret = wasm.audioengine_sample_rate(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) SpeakerNode.prototype[Symbol.dispose] = SpeakerNode.prototype.free;

export class SynthNode {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SynthNodeFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_synthnode_free(ptr, 0);
    }
    /**
     * @param {number} sample_rate
     */
    constructor(sample_rate) {
        const ret = wasm.synthnode_new(sample_rate);
        this.__wbg_ptr = ret >>> 0;
        SynthNodeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} note
     */
    note_off(note) {
        wasm.synthnode_note_off(this.__wbg_ptr, note);
    }
    /**
     * @param {number} note
     * @param {number} velocity
     */
    note_on(note, velocity) {
        wasm.synthnode_note_on(this.__wbg_ptr, note, velocity);
    }
    /**
     * @param {Float32Array} output
     */
    process(output) {
        var ptr0 = passArrayF32ToWasm0(output, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.synthnode_process(this.__wbg_ptr, ptr0, len0, output);
    }
    /**
     * @param {number} attack
     * @param {number} decay
     * @param {number} sustain
     * @param {number} release
     */
    set_adsr(attack, decay, sustain, release) {
        wasm.synthnode_set_adsr(this.__wbg_ptr, attack, decay, sustain, release);
    }
    /**
     * @param {number} gain
     */
    set_gain(gain) {
        wasm.synthnode_set_gain(this.__wbg_ptr, gain);
    }
    /**
     * @param {number} time_ms
     */
    set_glide(time_ms) {
        wasm.synthnode_set_glide(this.__wbg_ptr, time_ms);
    }
    /**
     * @param {number} max
     */
    set_max_voices(max) {
        wasm.synthnode_set_max_voices(this.__wbg_ptr, max);
    }
    /**
     * @param {number} waveform
     */
    set_waveform(waveform) {
        wasm.synthnode_set_waveform(this.__wbg_ptr, waveform);
    }
    /**
     * @param {boolean} down
     */
    sustain_pedal(down) {
        wasm.synthnode_sustain_pedal(this.__wbg_ptr, down);
    }
}
if (Symbol.dispose) SynthNode.prototype[Symbol.dispose] = SynthNode.prototype.free;

/**
 * @enum {0 | 1 | 2 | 3}
 */
export const Waveform = Object.freeze({
    Sine: 0, "0": "Sine",
    Square: 1, "1": "Square",
    Sawtooth: 2, "2": "Sawtooth",
    Triangle: 3, "3": "Triangle",
});

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_copy_to_typed_array_fc0809a4dec43528: function(arg0, arg1, arg2) {
            new Uint8Array(arg2.buffer, arg2.byteOffset, arg2.byteLength).set(getArrayU8FromWasm0(arg0, arg1));
        },
        __wbg___wbindgen_throw_be289d5034ed271b: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_log_12e85d2f2217123e: function(arg0, arg1) {
            console.log(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./audio_engine_bg.js": import0,
    };
}

const AudioEngineFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_audioengine_free(ptr >>> 0, 1));
const LfoNodeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_lfonode_free(ptr >>> 0, 1));
const MidiTransposeNodeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_miditransposenode_free(ptr >>> 0, 1));
const OscillatorNodeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_oscillatornode_free(ptr >>> 0, 1));
const ReverbNodeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_reverbnode_free(ptr >>> 0, 1));
const SpeakerNodeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_speakernode_free(ptr >>> 0, 1));
const SynthNodeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_synthnode_free(ptr >>> 0, 1));

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('audio_engine_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
