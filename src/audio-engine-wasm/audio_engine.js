let wasm;

const cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : { decode: () => { throw Error('TextDecoder not available') } } );

if (typeof TextDecoder !== 'undefined') { cachedTextDecoder.decode(); };

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

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

let WASM_VECTOR_LEN = 0;

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

const AudioEngineFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_audioengine_free(ptr >>> 0, 1));

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
     * @param {number} sample_rate
     */
    constructor(sample_rate) {
        const ret = wasm.audioengine_new(sample_rate);
        this.__wbg_ptr = ret >>> 0;
        AudioEngineFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    get sample_rate() {
        const ret = wasm.audioengine_sample_rate(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get buffer_size() {
        const ret = wasm.audioengine_buffer_size(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {Float32Array} output
     */
    process_audio(output) {
        var ptr0 = passArrayF32ToWasm0(output, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.audioengine_process_audio(this.__wbg_ptr, ptr0, len0, output);
    }
}

const LfoNodeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_lfonode_free(ptr >>> 0, 1));

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
     * @param {number} beats_per_cycle
     * @param {number} waveform_index
     * @param {number} phase_offset
     */
    set_params(beats_per_cycle, waveform_index, phase_offset) {
        wasm.lfonode_set_params(this.__wbg_ptr, beats_per_cycle, waveform_index, phase_offset);
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
}

const MidiTransposeNodeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_miditransposenode_free(ptr >>> 0, 1));

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

const OscillatorNodeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_oscillatornode_free(ptr >>> 0, 1));

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
     * @param {number} sample_rate
     */
    constructor(sample_rate) {
        const ret = wasm.oscillatornode_new(sample_rate);
        this.__wbg_ptr = ret >>> 0;
        OscillatorNodeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} freq
     */
    set frequency(freq) {
        wasm.oscillatornode_set_frequency(this.__wbg_ptr, freq);
    }
    /**
     * @returns {number}
     */
    get frequency() {
        const ret = wasm.oscillatornode_frequency(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} amp
     */
    set amplitude(amp) {
        wasm.oscillatornode_set_amplitude(this.__wbg_ptr, amp);
    }
    /**
     * @returns {number}
     */
    get amplitude() {
        const ret = wasm.oscillatornode_amplitude(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} waveform
     */
    set_waveform(waveform) {
        wasm.oscillatornode_set_waveform(this.__wbg_ptr, waveform);
    }
    /**
     * @param {Float32Array} output
     */
    process(output) {
        var ptr0 = passArrayF32ToWasm0(output, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.oscillatornode_process(this.__wbg_ptr, ptr0, len0, output);
    }
}

const ReverbNodeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_reverbnode_free(ptr >>> 0, 1));

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
     * @param {number} sample_rate
     */
    constructor(sample_rate) {
        const ret = wasm.reverbnode_new(sample_rate);
        this.__wbg_ptr = ret >>> 0;
        ReverbNodeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} feedback
     */
    set feedback(feedback) {
        wasm.reverbnode_set_feedback(this.__wbg_ptr, feedback);
    }
    /**
     * @returns {number}
     */
    get feedback() {
        const ret = wasm.reverbnode_feedback(this.__wbg_ptr);
        return ret;
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
}

const SpeakerNodeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_speakernode_free(ptr >>> 0, 1));

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
    constructor() {
        const ret = wasm.speakernode_new();
        this.__wbg_ptr = ret >>> 0;
        SpeakerNodeFinalization.register(this, this.__wbg_ptr, this);
        return this;
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
        const ret = wasm.speakernode_volume(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {boolean} muted
     */
    set muted(muted) {
        wasm.speakernode_set_muted(this.__wbg_ptr, muted);
    }
    /**
     * @returns {boolean}
     */
    get muted() {
        const ret = wasm.speakernode_muted(this.__wbg_ptr);
        return ret !== 0;
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
}

const SynthNodeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_synthnode_free(ptr >>> 0, 1));

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
     * @param {number} velocity
     */
    note_on(note, velocity) {
        wasm.synthnode_note_on(this.__wbg_ptr, note, velocity);
    }
    /**
     * @param {number} note
     */
    note_off(note) {
        wasm.synthnode_note_off(this.__wbg_ptr, note);
    }
    /**
     * @param {boolean} down
     */
    sustain_pedal(down) {
        wasm.synthnode_sustain_pedal(this.__wbg_ptr, down);
    }
    /**
     * @param {number} waveform
     */
    set_waveform(waveform) {
        wasm.synthnode_set_waveform(this.__wbg_ptr, waveform);
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
     * @param {number} time_ms
     */
    set_glide(time_ms) {
        wasm.synthnode_set_glide(this.__wbg_ptr, time_ms);
    }
    /**
     * @param {number} gain
     */
    set_gain(gain) {
        wasm.synthnode_set_gain(this.__wbg_ptr, gain);
    }
    /**
     * @param {number} max
     */
    set_max_voices(max) {
        wasm.synthnode_set_max_voices(this.__wbg_ptr, max);
    }
    /**
     * @param {Float32Array} output
     */
    process(output) {
        var ptr0 = passArrayF32ToWasm0(output, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.synthnode_process(this.__wbg_ptr, ptr0, len0, output);
    }
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                if (module.headers.get('Content-Type') != 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
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
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg_log_12e85d2f2217123e = function(arg0, arg1) {
        console.log(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbindgen_copy_to_typed_array = function(arg0, arg1, arg2) {
        new Uint8Array(arg2.buffer, arg2.byteOffset, arg2.byteLength).set(getArrayU8FromWasm0(arg0, arg1));
    };
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_export_0;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
        ;
    };
    imports.wbg.__wbindgen_throw = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };

    return imports;
}

function __wbg_init_memory(imports, memory) {

}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedFloat32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();

    __wbg_init_memory(imports);

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('audio_engine_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    __wbg_init_memory(imports);

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
