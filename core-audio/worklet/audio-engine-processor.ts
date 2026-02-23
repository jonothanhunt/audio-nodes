// src/audio/audio-engine-processor.ts
// AudioWorkletProcessor that runs the WASM audio engine off the main thread.
// It mirrors the processing previously done in AudioManager ScriptProcessorNode.

/// <reference path="./worklet.d.ts" />
/// <reference path="./wasm-engine.d.ts" />

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface NodeData {
    type: string;
    [key: string]: string | number | boolean | object | null | undefined;
}

interface Connection {
    from: string;
    to: string;
    fromOutput: string | null;
    toInput: string | null;
}

interface ParamConnection {
    from: string;
    to: string;
    fromOutput: string | null;
    targetParam: string;
}

interface MidiEvent {
    data: number[];
    atFrame?: number;
    atTimeMs?: number;
}

interface Timebase {
    perfNowMs: number;
    audioCurrentTimeSec: number;
}

interface ScratchBuffers {
    temp: Float32Array | null;
    inL: Float32Array | null;
    inR: Float32Array | null;
    sumL: Float32Array | null;
    sumR: Float32Array | null;
    size: number;
}

interface Transport {
    bpm: number;
    frameCounter: number;
    framesPerBeat: number;
    nextBeatFrame: number;
    beatIndex: number;
    pendingBpm: number | null;
    pendingBpmBeat: number | null;
    syncAllNextBeat: boolean;
}

interface SequencerEntry {
    rateMultiplier: number;
    isPlaying: boolean;
    pendingStartBeat: number | null;
    pendingRate: number | null;
    stepIndex: number;
    beatsAccum: number;
    activeNotes: Set<number>;
    _startedOnce: boolean;
}

interface ArpEntry {
    rateMultiplier: number;
    isPlaying: boolean;
    pendingStartBeat: number | null;
    pendingRate: number | null;
    beatsAccum: number;
    held: Set<number>;
    order: number[];
    dir: 1 | -1;
    activeOut: Set<number>;
    mode: string;
    octaves: number;
}

interface TransposeNoteState {
    active: Map<number, number>;
    lastSemitones: number;
}

// Discriminated union of all inbound messages from the main thread
type WorkletMessage =
    | { type: 'setBpm'; bpm: number }
    | { type: 'syncAllNextBeat' }
    | { type: 'setSequencerRate'; nodeId: string; multiplier: number }
    | { type: 'setSequencerPlay'; nodeId: string; play: boolean }
    | { type: 'setArpRate'; nodeId: string; multiplier: number }
    | { type: 'setArpPlay'; nodeId: string; play: boolean }
    | { type: 'panic' }
    | { type: 'bootstrapWasm'; glue: string; wasm: ArrayBuffer }
    | { type: 'updateNode'; nodeId: string; data: NodeData }
    | { type: 'removeNode'; nodeId: string }
    | { type: 'updateConnections'; connections: Connection[] }
    | { type: 'clear' }
    | { type: 'timebase'; perfNowMs: number; audioCurrentTimeSec: number }
    | { type: 'midi'; sourceId: string; events: MidiEvent[] }
    | { type: 'startCapture' }
    | { type: 'stopCapture' };

// Cast globalThis for WASM bootstrap dynamic code evaluation
const _global = globalThis as Record<string, any>;

// Waveform name to index mapping
type WaveformName = 'sine' | 'square' | 'sawtooth' | 'triangle';

const WAVEFORM_INDEX: Record<WaveformName, number> = {
    sine: 0,
    square: 1,
    sawtooth: 2,
    triangle: 3,
};

const LFO_WAVEFORM_INDEX: Record<string, number> = {
    sine: 0,
    triangle: 1,
    saw: 2,
    square: 3,
};

// ---------------------------------------------------------------------------
// EngineProcessor
// ---------------------------------------------------------------------------

class EngineProcessor extends AudioWorkletProcessor {
    private _ready: boolean;
    private _loading: boolean;
    private _wasm: WasmEngineModule | null;

    private _nodes: Map<string, NodeData>;
    private _connections: Connection[];
    private _paramCache: Map<string, NodeData>;

    private _oscInstances: Map<string, WasmOscillatorNode>;
    private _reverbInstances: Map<string, WasmReverbNode>;
    private _synthInstances: Map<string, WasmSynthNode>;
    private _transposeInstances: Map<string, WasmMidiTransposeNode>;
    private _lfoInstances: Map<string, WasmLfoNode>;
    private _lfoValues: Map<string, number>;
    private _paramConnections: ParamConnection[];

    private _midiQueues: Map<string, MidiEvent[]>;
    private _timebase: Timebase;
    private _scratch: ScratchBuffers;

    private _transposeNoteState: Map<string, TransposeNoteState>;
    private _transport: Transport;
    private _captureActive: boolean;
    private _sequencers: Map<string, SequencerEntry>;
    private _arps: Map<string, ArpEntry>;
    private _propagatedValues?: Map<string, string | number | boolean | object | null | undefined>;

    constructor() {
        super();

        this._ready = false;
        this._loading = false;
        this._wasm = null;

        this._nodes = new Map();
        this._connections = [];
        this._paramCache = new Map();

        this._oscInstances = new Map();
        this._reverbInstances = new Map();
        this._synthInstances = new Map();
        this._transposeInstances = new Map();
        this._lfoInstances = new Map();
        this._lfoValues = new Map();
        this._paramConnections = [];

        this._midiQueues = new Map();
        this._timebase = { perfNowMs: 0, audioCurrentTimeSec: 0 };
        this._scratch = {
            temp: null,
            inL: null,
            inR: null,
            sumL: null,
            sumR: null,
            size: 0,
        };

        this.port.onmessage = (e: MessageEvent) => this._handleMessage(e.data);

        this._initWasm();

        this._transposeNoteState = new Map();

        this._transport = {
            bpm: 120,
            frameCounter: 0,
            framesPerBeat: (60 / 120) * sampleRate,
            nextBeatFrame: 0,
            beatIndex: 0,
            pendingBpm: null,
            pendingBpmBeat: null,
            syncAllNextBeat: false,
        };

        this._captureActive = false;

        this._sequencers = new Map();
        this._arps = new Map();
    }

    async _initWasm() {
        if (this._loading || this._ready) return;
        this._loading = true;
        try {
            // Signal main thread to provide glue and wasm bytes
            this.port.postMessage({ type: "needBootstrap" });
        } finally {
            this._loading = false;
        }
    }

    // Queue All Notes Off (CC 123) to all synth nodes to ensure hanging notes are stopped
    _queueAllNotesOffToAllSynths() {
        try {
            for (const [nid, data] of this._nodes.entries()) {
                if (!data || data.type !== "synth") continue;
                const q = this._midiQueues.get(nid) || [];
                for (let ch = 0; ch < 16; ch++) {
                    q.push({ data: [0xb0 | ch, 123, 0] }); // CC 123 All Notes Off
                }
                this._midiQueues.set(nid, q);
            }
        } catch {
            /* ignore */
        }
    }

    async _bootstrapFromMain(glueCode: string, wasmBytes: ArrayBuffer): Promise<void> {
        if (this._ready || this._loading) return;
        this._loading = true;
        try {
            let code = String(glueCode);
            code = `
if (typeof globalThis.TextDecoder === 'undefined') {
    globalThis.TextDecoder = class {
        decode(arr) {
            if (!arr) return '';
            let s = '';
            for (let i = 0; i < arr.length; i++) {
                s += String.fromCharCode(arr[i]);
            }
            return s;
        }
    };
}
` + code;
            code = code.replace(/^export\s+class\s+/gm, "class ");
            code = code.replace(/^export\s+const\s+/gm, "const ");
            code = code.replace(/^export\s*\{[^}]+\};?/gm, "");
            code = code.replace(/export\s+default\s+__wbg_init\s*;?/gm, "");
            code += "\nglobalThis.__wbg_init_default = __wbg_init;\n";
            code += "globalThis.__wbg_initSync = initSync;\n";
            code = code.replace(/import\.meta\.url/g, "'/audio-engine-wasm/'");
            // Explicitly expose classes to globalThis
            code +=
                '\ntry { globalThis.AudioEngine = typeof AudioEngine !== "undefined" ? AudioEngine : globalThis.AudioEngine; } catch(_){}';
            code +=
                '\ntry { globalThis.OscillatorNode = typeof OscillatorNode !== "undefined" ? OscillatorNode : globalThis.OscillatorNode; } catch(_){}';
            code +=
                '\ntry { globalThis.ReverbNode = typeof ReverbNode !== "undefined" ? ReverbNode : globalThis.ReverbNode; } catch(_){}';
            code +=
                '\ntry { globalThis.SpeakerNode = typeof SpeakerNode !== "undefined" ? SpeakerNode : globalThis.SpeakerNode; } catch(_){}';
            code +=
                '\ntry { globalThis.SynthNode = typeof SynthNode !== "undefined" ? SynthNode : globalThis.SynthNode; } catch(_){}';
            code +=
                '\ntry { globalThis.MidiTransposeNode = typeof MidiTransposeNode !== "undefined" ? MidiTransposeNode : globalThis.MidiTransposeNode; } catch(_){}';
            code +=
                '\ntry { globalThis.LfoNode = typeof LfoNode !== "undefined" ? LfoNode : globalThis.LfoNode; } catch(_){}';
            new Function(code)();
            if (typeof (_global as Record<string, any>).__wbg_init_default !== "function") {
                throw new Error(
                    "WASM init function not found after transforming glue"
                );
            }
            await (_global.__wbg_init_default as (bytes: ArrayBuffer) => Promise<void>)(wasmBytes);
            this._wasm = {
                AudioEngine: _global.AudioEngine,
                OscillatorNode: _global.OscillatorNode as WasmOscillatorNodeConstructor,
                ReverbNode: _global.ReverbNode as WasmReverbNodeConstructor,
                SpeakerNode: _global.SpeakerNode as WasmSpeakerNodeConstructor,
                SynthNode: _global.SynthNode as WasmSynthNodeConstructor,
                MidiTransposeNode: _global.MidiTransposeNode as WasmMidiTransposeNodeConstructor,
                LfoNode: _global.LfoNode as WasmLfoNodeConstructor,
            };
            if (typeof this._wasm.SynthNode !== "function") {
                this.port.postMessage({
                    type: "error",
                    message:
                        "SynthNode constructor missing in worklet (type=" +
                        typeof this._wasm.SynthNode +
                        ")",
                });
            }
            if (typeof this._wasm.MidiTransposeNode !== "function") {
                this.port.postMessage({
                    type: "error",
                    message: "MidiTransposeNode constructor missing in worklet",
                });
            }
            this._ready = true;
            this.port.postMessage({ type: "ready", sampleRate });
        } catch (err) {
            try {
                this.port.postMessage({ type: "error", message: String(err) });
            } catch { }
        } finally {
            this._loading = false;
        }
    }

    _handleMessage(msg: WorkletMessage): void {
        if (!msg || typeof msg !== "object") return;
        switch (msg.type) {
            case "setBpm": {
                const bpm = Number(msg.bpm);
                if (isFinite(bpm) && bpm >= 20 && bpm <= 300) {
                    const t = this._transport;
                    t.pendingBpm = bpm;
                    t.pendingBpmBeat = t.beatIndex + 1; // apply next beat
                }
                break;
            }
            case "syncAllNextBeat": {
                this._transport.syncAllNextBeat = true; // schedule sync on next beat
                break;
            }
            case "setSequencerRate": {
                const { nodeId, multiplier } = msg;
                if (!nodeId) break;
                const m = Number(multiplier);
                if (![0.25, 0.5, 1, 2, 4].includes(m)) break;
                let entry = this._sequencers.get(nodeId);
                if (!entry) {
                    entry = {
                        rateMultiplier: 1,
                        isPlaying: false,
                        pendingStartBeat: null,
                        pendingRate: null,
                        stepIndex: 0,
                        beatsAccum: 0,
                        activeNotes: new Set(),
                        _startedOnce: false,
                    };
                    this._sequencers.set(nodeId, entry);
                }
                // Apply at next beat to avoid mid-step timing discontinuity
                entry.pendingRate = m;
                break;
            }
            case "setSequencerPlay": {
                const { nodeId, play } = msg;
                if (!nodeId) break;
                // Skip if 'playing' is currently driven by a param connection (e.g. a Bool node).
                // In that case the per-block _applyParamModulations path owns it.
                const isPlayingModulated = this._paramConnections &&
                    this._paramConnections.some(m => m.to === nodeId && m.targetParam === 'playing');
                if (isPlayingModulated) break;
                let entry = this._sequencers.get(nodeId);
                if (!entry) {
                    entry = {
                        rateMultiplier: 1,
                        isPlaying: false,
                        pendingStartBeat: null,
                        pendingRate: null,
                        stepIndex: 0,
                        beatsAccum: 0,
                        activeNotes: new Set(),
                        _startedOnce: false,
                    };
                    this._sequencers.set(nodeId, entry);
                }
                if (play) {
                    // Quantize start to next beat for snappier response.
                    if (!entry.isPlaying && entry.pendingStartBeat == null) {
                        entry.pendingStartBeat = this._transport.beatIndex + 1;
                    }
                } else {
                    // Stop immediately (gated) but do not reset step index
                    entry.isPlaying = false;
                    entry.pendingStartBeat = null;
                    // Send NoteOff for any active notes
                    if (entry.activeNotes.size) {
                        const outEvents = [];
                        for (const midi of entry.activeNotes.values()) {
                            outEvents.push({ data: [0x80, midi & 0x7f, 0] });
                        }
                        this._broadcastSequencerMIDI(nodeId, outEvents);
                        entry.activeNotes.clear();
                    }
                }
                break;
            }
            case 'setArpRate': {
                const { nodeId, multiplier } = msg;
                if (!nodeId) break;
                const m = Number(multiplier);
                if (![0.25, 0.5, 1, 2, 4].includes(m)) break;
                let entry = this._arps.get(nodeId);
                if (!entry) { entry = { rateMultiplier: 1, isPlaying: false, pendingStartBeat: null, pendingRate: null, beatsAccum: 0, held: new Set(), order: [], dir: 1, activeOut: new Set(), mode: 'up', octaves: 1 }; this._arps.set(nodeId, entry); }
                entry.pendingRate = m;
                break;
            }
            case 'setArpPlay': {
                const { nodeId, play } = msg;
                if (!nodeId) break;
                let entry = this._arps.get(nodeId);
                if (!entry) { entry = { rateMultiplier: 1, isPlaying: false, pendingStartBeat: null, pendingRate: null, beatsAccum: 0, held: new Set(), order: [], dir: 1, activeOut: new Set(), mode: 'up', octaves: 1 }; this._arps.set(nodeId, entry); }
                if (play) {
                    if (!entry.isPlaying && entry.pendingStartBeat == null) entry.pendingStartBeat = this._transport.beatIndex + 1;
                } else {
                    entry.isPlaying = false; entry.pendingStartBeat = null; entry.beatsAccum = 0; // send note off for any active notes
                    if (entry.activeOut.size) {
                        const offEvents = [];
                        for (const n of entry.activeOut.values()) offEvents.push({ data: [0x80, n & 0x7f, 0] });
                        this._broadcastArpMIDI(nodeId, offEvents);
                        entry.activeOut.clear();
                    }
                }
                break;
            }
            case 'panic': {
                this._handlePanic();
                break;
            }
            case "bootstrapWasm": {
                const { glue, wasm } = msg;
                this._bootstrapFromMain(glue, wasm);
                try {
                    this.port.postMessage({ type: "ackBootstrap" });
                } catch { }
                break;
            }
            case "updateNode": {
                const { nodeId, data } = msg;
                let outData: NodeData;
                try {
                    outData = { type: data.type };
                    for (const [key, val] of Object.entries(data)) {
                        outData[key] = val as string | number | boolean | object | null | undefined;
                    }
                } catch {
                    outData = data as NodeData;
                }
                this._nodes.set(nodeId, outData);
                try {
                    this._paramCache.set(nodeId, outData);
                } catch { }
                // If this is a sequencer node, ensure a registry entry exists reflecting current persisted state.
                if (data && data.type === "sequencer") {
                    let entry = this._sequencers.get(nodeId);
                    if (!entry) {
                        entry = {
                            rateMultiplier: 1,
                            isPlaying: false,
                            pendingStartBeat: null,
                            pendingRate: null,
                            stepIndex: 0,
                            beatsAccum: 0,
                            activeNotes: new Set(),
                            _startedOnce: false,
                        };
                        this._sequencers.set(nodeId, entry);
                    }
                    // Apply persisted rateMultiplier immediately (will influence step duration)
                    if (typeof data.rateMultiplier === "number" && [0.25, 0.5, 1, 2, 4].includes(data.rateMultiplier)) {
                        entry.rateMultiplier = data.rateMultiplier;
                    }
                    // If project saved with playing=true, quantize start to next beat unless already scheduled/playing
                    if (data.playing && !entry.isPlaying && entry.pendingStartBeat == null) {
                        entry.pendingStartBeat = this._transport.beatIndex + 1;
                    }
                }
                // If arpeggiator, ensure registry entry & update mode/octaves and persisted rate/play
                if (data && data.type === 'arpeggiator') {
                    let e = this._arps.get(nodeId);
                    if (!e) { e = { rateMultiplier: 1, isPlaying: false, pendingStartBeat: null, pendingRate: null, beatsAccum: 0, held: new Set(), order: [], dir: 1, activeOut: new Set(), mode: 'up', octaves: 1 }; this._arps.set(nodeId, e); }
                    const oldMode = e.mode;
                    const oldOct = e.octaves;
                    if (typeof data.rateMultiplier === 'number' && [0.25, 0.5, 1, 2, 4].includes(data.rateMultiplier)) e.rateMultiplier = data.rateMultiplier;
                    if (data.playing && !e.isPlaying && e.pendingStartBeat == null) e.pendingStartBeat = this._transport.beatIndex + 1;
                    if (typeof data.mode === 'string') e.mode = data.mode;
                    if (typeof data.octaves === 'number') e.octaves = Math.max(1, Math.min(4, data.octaves | 0));
                    // If pattern topology changed, flush active notes to avoid hangs
                    if (oldMode !== e.mode || oldOct !== e.octaves) {
                        if (e.activeOut.size) {
                            const offs = [];
                            for (const n of e.activeOut.values()) offs.push({ data: [0x80, n & 0x7f, 0] });
                            this._broadcastArpMIDI(nodeId, offs);
                            e.activeOut.clear();
                        }
                    }
                }
                try {
                    this.port.postMessage({ type: "ackNode", nodeId });
                } catch { }
                break;
            }
            case "removeNode": {
                const { nodeId } = msg;
                const oldData = this._nodes.get(nodeId);
                // Clean up sequencer registry if present
                if (this._sequencers.has(nodeId)) {
                    this._sequencers.delete(nodeId);
                }
                // If removing a transpose node, send NoteOff for any active transformed notes downstream
                if (oldData && oldData.type === "midi-transpose") {
                    const state = this._transposeNoteState.get(nodeId);
                    if (state && state.active && state.active.size > 0) {
                        const outEvents = [];
                        for (const [
                            key,
                            transposedNote,
                        ] of state.active.entries()) {
                            const channel = (key >> 7) & 0x0f;
                            outEvents.push({
                                data: [
                                    0x80 | channel,
                                    transposedNote & 0x7f,
                                    0,
                                ],
                            });
                        }
                        const downstream = this._connections.filter(
                            (c) =>
                                c.from === nodeId &&
                                (c.fromOutput === "midi-out" ||
                                    c.fromOutput === "midi" ||
                                    c.fromOutput == null)
                        );
                        if (downstream.length) {
                            for (const edge of downstream) {
                                const q = this._midiQueues.get(edge.to) || [];
                                for (const ev of outEvents) q.push(ev);
                                this._midiQueues.set(edge.to, q);
                            }
                        } else {
                            this._queueAllNotesOffToAllSynths();
                        }
                        state.active.clear();
                    } else {
                        this._queueAllNotesOffToAllSynths();
                    }
                }
                // If removing a sequencer or MIDI input, proactively stop any sounding notes
                if (
                    oldData &&
                    (oldData.type === "sequencer" ||
                        oldData.type === "midi-input")
                ) {
                    this._queueAllNotesOffToAllSynths();
                }
                // Proceed with removal and free
                this._nodes.delete(nodeId);
                const osc = this._oscInstances.get(nodeId);
                if (osc) {
                    try {
                        osc.free?.();
                    } catch { }
                    this._oscInstances.delete(nodeId);
                }
                const rev = this._reverbInstances.get(nodeId);
                if (rev) {
                    try {
                        rev.free?.();
                    } catch { }
                    this._reverbInstances.delete(nodeId);
                }
                const syn = this._synthInstances.get(nodeId);
                if (syn) {
                    try {
                        syn.free?.();
                    } catch { }
                    this._synthInstances.delete(nodeId);
                }
                const tr = this._transposeInstances.get(nodeId);
                if (tr) {
                    try {
                        tr.free?.();
                    } catch { }
                    this._transposeInstances.delete(nodeId);
                }
                this._transposeNoteState.delete(nodeId);
                try {
                    this.port.postMessage({ type: "ackRemove", nodeId });
                } catch { }
                break;
            }
            case "updateConnections": {
                const { connections } = msg;
                this._connections = Array.isArray(connections)
                    ? connections
                    : [];
                // Rebuild parameter connections: any edge targeting a param-in
                this._paramConnections = [];
                for (const c of this._connections) {
                    if (c.toInput && !['input', 'output', 'midi', 'midi-out', 'audio-in', 'audio-out'].includes(c.toInput)) {
                        let tp = c.toInput;
                        if (tp.startsWith('param-')) tp = tp.substring(6);
                        this._paramConnections.push({ from: c.from, to: c.to, fromOutput: c.fromOutput, targetParam: tp });
                    }
                }
                try {
                    this.port.postMessage({
                        type: "ackConnections",
                        count: this._connections.length,
                    });
                } catch { }
                break;
            }
            case "clear": {
                this._nodes.clear();
                this._connections = [];
                this._paramConnections = [];
                this._paramCache.clear?.();
                this._lfoValues.clear();
                this._sequencers.clear();
                this._arps.clear();
                for (const inst of this._oscInstances.values()) {
                    try {
                        inst.free?.();
                    } catch { }
                }
                for (const inst of this._reverbInstances.values()) {
                    try {
                        inst.free?.();
                    } catch { }
                }
                for (const inst of this._synthInstances.values()) {
                    try {
                        inst.free?.();
                    } catch { }
                }
                for (const inst of this._transposeInstances.values()) {
                    try {
                        inst.free?.();
                    } catch { }
                }
                this._oscInstances.clear();
                this._reverbInstances.clear();
                this._synthInstances.clear();
                this._transposeInstances.clear();
                try {
                    this.port.postMessage({ type: "ackClear" });
                } catch { }
                break;
            }
            case "timebase": {
                const { perfNowMs, audioCurrentTimeSec } = msg;
                this._timebase = {
                    perfNowMs: Number(perfNowMs) || 0,
                    audioCurrentTimeSec: Number(audioCurrentTimeSec) || 0,
                };
                break;
            }
            case "midi": {
                const { sourceId, events } = msg;
                const midiEdges = this._connections.filter(
                    (c) =>
                        c.from === sourceId &&
                        (c.fromOutput === "midi" ||
                            c.fromOutput === "midi-out" ||
                            c.fromOutput == null)
                );
                for (const edge of midiEdges) {
                    const q = this._midiQueues.get(edge.to) || [];
                    if (Array.isArray(events)) {
                        for (const ev of events) {
                            if (!ev || !Array.isArray(ev.data)) continue;
                            q.push({
                                data: ev.data.slice(0, 3),
                                atFrame: ev.atFrame,
                                atTimeMs: ev.atTimeMs,
                            });
                        }
                    }
                    this._midiQueues.set(edge.to, q);
                }
                break;
            }
            case 'startCapture': {
                this._captureActive = true;
                break;
            }
            case 'stopCapture': {
                this._captureActive = false;
                try { this.port.postMessage({ type: 'captureStopped' }); } catch { }
                break;
            }
            default:
                break;
        }
    }

    // Convert atTimeMs to frame index within current block if provided
    _resolveEventFrame(atFrame: number | undefined, atTimeMs: number | undefined, blockStartTimeSec: number, blockSize: number): number {
        if (typeof atFrame === "number" && isFinite(atFrame)) {
            return Math.max(0, Math.min(blockSize - 1, Math.floor(atFrame)));
        }
        if (typeof atTimeMs === "number" && isFinite(atTimeMs)) {
            const workletPerfOffsetSec =
                this._timebase.audioCurrentTimeSec -
                this._timebase.perfNowMs / 1000;
            const eventTimeSec = atTimeMs / 1000 + workletPerfOffsetSec;
            const framesFromBlockStart = Math.floor(
                (eventTimeSec - blockStartTimeSec) * sampleRate
            );
            if (framesFromBlockStart < 0 || framesFromBlockStart >= blockSize)
                return 0;
            return framesFromBlockStart;
        }
        return 0;
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
        const output = outputs[0];
        if (!output || output.length === 0) return true;

        const outL = output[0];
        const outR = output[1] || output[0]; // mono if only one channel configured

        // Clear
        outL.fill(0);
        outR.fill(0);

        if (!this._ready || !this._wasm) {
            return true;
        }

        try {
            const blockSize = outL.length;
            // Allocate scratch buffers once per block size change
            if (this._scratch.size !== blockSize) {
                this._scratch.temp = new Float32Array(blockSize);
                this._scratch.inL = new Float32Array(blockSize);
                this._scratch.inR = new Float32Array(blockSize);
                this._scratch.sumL = new Float32Array(blockSize);
                this._scratch.sumR = new Float32Array(blockSize);
                this._scratch.size = blockSize;
            }
            // Approximate current audio time for this block
            const blockStartTimeSec = this._timebase.audioCurrentTimeSec; // updated when host sends timebase; coarse but fine for scheduling

            // Pre-evaluate all LFO nodes once per block
            this._lfoValues.clear();
            const lfoNodes = Array.from(this._nodes.entries()).filter(([_, d]) => d?.type === 'lfo');
            for (const [nid, lfoNode] of lfoNodes) {
                const inst = this._getLfoInstance(nid);
                if (!inst) continue;
                const beats = Number(lfoNode.beatsPerCycle) || 1;

                const wf = LFO_WAVEFORM_INDEX[lfoNode.waveform as string] ?? 0;
                const phase = Number(lfoNode.phase) || 0;
                try { inst.set_params(beats, wf, phase); } catch { }
                const raw = inst.next_value(blockSize, this._transport.bpm);
                let depth = Number(lfoNode.depth); if (!isFinite(depth)) depth = 1;
                let offset = Number(lfoNode.offset); if (!isFinite(offset)) offset = 0;
                const bipolar = lfoNode.bipolar !== false;
                let v = raw;
                if (!bipolar) v = (v + 1) * 0.5;
                v = v * depth + offset;
                this._lfoValues.set(nid, v);
            }

            // --- Pre-propagate value-node connections (e.g. Bool A → Bool B.value) ---
            // Value nodes (value-bool, value-number, etc.) act as pass-through sources.
            // Their 'value' field in _nodes must be patched before downstream modulations run.
            // We loop up to 4 times to handle chains of arbitrary depth.
            this._propagateValueNodes();

            // --- Pre-process Param Modulations for stateful MIDI nodes ---
            for (const [nid, entry] of this._sequencers.entries()) {
                const data = this._nodes.get(nid);
                if (!data) continue;
                const patched = this._applyParamModulations(nid, data);
                if (patched !== data) {
                    const play = !!patched.playing;
                    if (play && !entry.isPlaying && entry.pendingStartBeat == null) {
                        entry.pendingStartBeat = this._transport.beatIndex + 1;
                    } else if (!play && entry.isPlaying) {
                        entry.isPlaying = false;
                        entry.pendingStartBeat = null;
                        if (entry.activeNotes.size) {
                            const outEvents = [];
                            for (const midi of entry.activeNotes.values()) outEvents.push({ data: [0x80, midi & 0x7f, 0] });
                            this._broadcastSequencerMIDI(nid, outEvents);
                            entry.activeNotes.clear();
                        }
                    }
                    if (typeof patched.rateMultiplier === 'number') entry.pendingRate = patched.rateMultiplier;
                }
            }
            for (const [nid, entry] of this._arps.entries()) {
                const data = this._nodes.get(nid);
                if (!data) continue;
                const patched = this._applyParamModulations(nid, data);
                if (patched !== data) {
                    const play = !!patched.playing;
                    if (play && !entry.isPlaying && entry.pendingStartBeat == null) {
                        entry.pendingStartBeat = this._transport.beatIndex + 1;
                    } else if (!play && entry.isPlaying) {
                        entry.isPlaying = false;
                        entry.pendingStartBeat = null;
                        entry.beatsAccum = 0;
                        if (entry.activeOut.size) {
                            const offEvents = [];
                            for (const n of entry.activeOut.values()) offEvents.push({ data: [0x80, n & 0x7f, 0] });
                            this._broadcastArpMIDI(nid, offEvents);
                            entry.activeOut.clear();
                        }
                    }
                    if (typeof patched.rateMultiplier === 'number') entry.pendingRate = patched.rateMultiplier;
                    if (typeof patched.mode === 'string') entry.mode = patched.mode;
                    if (typeof patched.octaves === 'number') entry.octaves = Math.max(1, Math.min(4, Math.floor(patched.octaves)));
                }
            }

            // --- Beat scheduling (beat-only, no bars) ---
            const t = this._transport;
            const blockStartFrame = t.frameCounter;
            const blockEndFrame = blockStartFrame + blockSize;
            if (t.nextBeatFrame < blockStartFrame) t.nextBeatFrame = blockStartFrame;
            while (t.nextBeatFrame >= blockStartFrame && t.nextBeatFrame < blockEndFrame) {
                // Apply pending BPM
                if (t.pendingBpm != null && t.pendingBpmBeat === t.beatIndex) {
                    t.bpm = t.pendingBpm;
                    t.framesPerBeat = (60 / t.bpm) * sampleRate;
                    t.pendingBpm = null;
                    t.pendingBpmBeat = null;
                }
                try { this.port.postMessage({ type: "beat", beatIndex: t.beatIndex, bpm: t.bpm }); } catch { }
                t.beatIndex += 1;
                // Apply pending rate changes at beat boundary
                for (const [, entry] of this._sequencers.entries()) {
                    if (entry.pendingRate != null) { entry.rateMultiplier = entry.pendingRate; entry.pendingRate = null; }
                }
                for (const [, a] of this._arps.entries()) {
                    if (a.pendingRate != null) { a.rateMultiplier = a.pendingRate; a.pendingRate = null; }
                }
                // Global sync request
                if (t.syncAllNextBeat) {
                    try { this.port.postMessage({ type: "syncScheduled", beatIndex: t.beatIndex }); } catch { }
                    for (const [nid, entry] of this._sequencers.entries()) {
                        if (!entry.isPlaying) continue;
                        entry.stepIndex = 0;
                        entry.beatsAccum = 0;
                        entry._startedOnce = true;
                        try { this.port.postMessage({ type: "sequencerStep", nodeId: nid, stepIndex: 0 }); } catch { }
                    }
                    t.syncAllNextBeat = false;
                }
                // Start any newly scheduled sequencers
                for (const [, entry] of this._sequencers.entries()) {
                    if (entry.pendingStartBeat === t.beatIndex - 1) {
                        entry.isPlaying = true;
                        entry.stepIndex = 0;
                        entry.beatsAccum = 0;
                        entry.pendingStartBeat = null;
                        entry._startedOnce = false;
                    }
                }
                for (const [, a] of this._arps.entries()) {
                    if (a.pendingStartBeat === t.beatIndex - 1) { a.isPlaying = true; a.beatsAccum = 0; a.pendingStartBeat = null; if (a.activeOut.size) { const offs = []; for (const n of a.activeOut.values()) offs.push({ data: [0x80, n & 0x7f, 0] }); this._broadcastArpMIDI('' + Math.random(), offs); a.activeOut.clear(); } }
                }
                // Emit initial step events
                for (const [nid, entry] of this._sequencers.entries()) {
                    if (entry.isPlaying && entry._startedOnce === false) {
                        entry._startedOnce = true;
                        try { this.port.postMessage({ type: "sequencerStep", nodeId: nid, stepIndex: 0 }); } catch { }
                    }
                }
                t.nextBeatFrame += t.framesPerBeat;
                if (t.nextBeatFrame >= blockEndFrame) break;
            }

            // --- Sequencer step advancement (beat-fraction based) ---
            // Design: each step lasts 1/rate beats (independent of sequence length).
            // So at rate=1, one step per beat; longer sequences simply span more bars and drift naturally.
            const beatsAdvanced = (blockSize / t.framesPerBeat);
            if (this._sequencers.size) {
                for (const [nid, entry] of this._sequencers.entries()) {
                    if (!entry.isPlaying) continue;
                    const rate = entry.rateMultiplier || 1;
                    const stepDurationBeats = 1 / rate; // original intent
                    entry.beatsAccum += beatsAdvanced;
                    const nodeData = this._nodes.get(nid) || ({} as NodeData);
                    let length = Number(nodeData.length);
                    if (!isFinite(length) || length < 1) length = 16;
                    if (length > 256) length = 256;
                    let advanced = false;
                    while (entry.beatsAccum >= stepDurationBeats) {
                        entry.beatsAccum -= stepDurationBeats;
                        entry.stepIndex = (entry.stepIndex + 1) % length;
                        advanced = true;
                    }
                    if (advanced) {
                        try { this.port.postMessage({ type: "sequencerStep", nodeId: nid, stepIndex: entry.stepIndex }); } catch { }
                    }
                }
            }
            // Arpeggiator advancement
            if (this._arps.size) {
                for (const [nid, a] of this._arps.entries()) {
                    if (!a.isPlaying) continue;
                    a.beatsAccum += beatsAdvanced;
                    const stepBeats = 1 / (a.rateMultiplier || 1);
                    if (a.beatsAccum >= stepBeats) {
                        a.beatsAccum -= stepBeats;
                        // build ordered note list (with octaves) from held set
                        // held notes arrive via MIDI routing; maintain in a.held
                        if (a.held.size === 0) { // no notes held, turn off any currently sounding
                            if (a.activeOut.size) { const offs = []; for (const n of a.activeOut.values()) offs.push({ data: [0x80, n & 0x7f, 0] }); this._broadcastArpMIDI(nid, offs); a.activeOut.clear(); }
                            continue;
                        }
                        const baseNotes = Array.from(a.held.values()).sort((x, y) => x - y);
                        let expanded = baseNotes.slice();
                        const octs = Math.max(1, Math.min(4, a.octaves | 0));
                        if (octs > 1) {
                            for (let o = 1; o < octs; o++) {
                                for (const n of baseNotes) { const nn = n + 12 * o; if (nn <= 127) expanded.push(nn); }
                            }
                            expanded.sort((x, y) => x - y);
                        }
                        if (a.mode === 'random') {
                            const choice = expanded[Math.floor(Math.random() * expanded.length)];
                            if (choice != null) this._arpApplyOutputSet(nid, a, new Set([choice]));
                        } else if (a.mode === 'chord') {
                            this._arpApplyOutputSet(nid, a, new Set(expanded));
                        } else {
                            // maintain traversal order
                            if (!a.order.length) { a.order = expanded.slice(); a.dir = 1; }
                            // remove notes not held anymore
                            a.order = a.order.filter(n => expanded.includes(n));
                            // add new notes maintaining sort
                            for (const n of expanded) if (!a.order.includes(n)) a.order.push(n);
                            a.order.sort((x, y) => x - y);
                            if (a.mode === 'down') a.order.sort((x, y) => y - x);
                            if (a.mode === 'up-down') {
                                // bounce between ends; use dir to step
                                let lastIdx = -1;
                                if (a.activeOut.size === 1) { const only = a.activeOut.values().next().value!; lastIdx = a.order.indexOf(only); }
                                let idx = lastIdx;
                                if (idx < 0) idx = a.dir === 1 ? -1 : a.order.length; // start position before first/after last
                                idx += a.dir;
                                if (idx >= a.order.length) { a.dir = -1; idx = a.order.length - 2; }
                                else if (idx < 0) { a.dir = 1; idx = 1; }
                                const note = a.order[Math.max(0, Math.min(a.order.length - 1, idx))];
                                if (note != null) this._arpApplyOutputSet(nid, a, new Set([note]));
                            } else {
                                // linear (up or down already sorted)
                                let lastIdx = -1;
                                if (a.activeOut.size === 1) { const only = a.activeOut.values().next().value!; lastIdx = a.order.indexOf(only); }
                                let idx = lastIdx;
                                idx += 1;
                                if (idx >= a.order.length) idx = 0;
                                const note = a.order[idx];
                                if (note != null) this._arpApplyOutputSet(nid, a, new Set([note]));
                            }
                        }
                    }
                }
            }

            // Drain and dispatch MIDI to nodes before audio rendering
            for (const [nodeId, queue] of this._midiQueues.entries()) {
                if (!queue || queue.length === 0) continue;
                const nodeData = this._nodes.get(nodeId);
                if (!nodeData) continue;
                if (nodeData.type === "synth" && this._processSynthMIDI) {
                    const events = queue.splice(0, queue.length);
                    this._processSynthMIDI(
                        nodeId,
                        events,
                        blockStartTimeSec,
                        blockSize
                    );
                } else if (nodeData.type === "midi-transpose") {
                    const events = queue.splice(0, queue.length);
                    this._processTransposeMIDI(
                        nodeId,
                        nodeData,
                        events,
                    );
                } else if (nodeData.type === 'arpeggiator') {
                    // Maintain held note set for arpeggiator
                    const events = queue.splice(0, queue.length);
                    let entry = this._arps.get(nodeId);
                    if (!entry) { entry = { rateMultiplier: 1, isPlaying: false, pendingStartBeat: null, pendingRate: null, beatsAccum: 0, held: new Set(), order: [], dir: 1, activeOut: new Set(), mode: 'up', octaves: 1 }; this._arps.set(nodeId, entry); }
                    for (const ev of events) {
                        const [status, d1, d2] = ev.data;
                        const cmd = status & 0xf0;
                        if (cmd === 0x90 && (d2 & 0x7f) > 0) entry.held.add(d1 & 0x7f);
                        else if (cmd === 0x80 || (cmd === 0x90 && (d2 & 0x7f) === 0)) entry.held.delete(d1 & 0x7f);
                    }
                } else {
                    queue.length = 0; // drop
                }
            }
            // LFO evaluation was moved to the top of the block

            this._processGraph(outL, outR);

            // If capturing, send a copy of this block to main thread (Float32 PCM)
            if (this._captureActive) {
                // Copy to new arrays to avoid transferring underlying output buffers
                const left = new Float32Array(outL); // copy
                const right = new Float32Array(outR);
                try {
                    this.port.postMessage({ type: 'captureBlock', left, right }, [left.buffer, right.buffer]);
                } catch { }
            }

            // Advance coarse timebase by one block
            this._timebase.audioCurrentTimeSec += blockSize / sampleRate;
            t.frameCounter += blockSize;
        } catch (err) {
            try {
                this.port.postMessage({ type: "error", message: String(err) });
            } catch { }
        }

        return true;
    }

    _arpApplyOutputSet(nodeId: string, a: ArpEntry, newSet: Set<number>): void {
        // Determine off/on differences
        const offs = [];
        for (const n of a.activeOut.values()) if (!newSet.has(n)) offs.push({ data: [0x80, n & 0x7f, 0] });
        const ons = [];
        for (const n of newSet.values()) if (!a.activeOut.has(n)) ons.push({ data: [0x90, n & 0x7f, 100] });
        if (offs.length) this._broadcastArpMIDI(nodeId, offs);
        if (ons.length) this._broadcastArpMIDI(nodeId, ons);
        a.activeOut = newSet;
        if (ons.length === 1) { try { this.port.postMessage({ type: 'arpNote', nodeId, note: ons[0].data[1] }); } catch { } }
    }

    _broadcastArpMIDI(nodeId: string, events: MidiEvent[]): void {
        if (!Array.isArray(events) || !events.length) return;
        const downstream = this._connections.filter(c => c.from === nodeId && (c.fromOutput === 'midi-out' || c.fromOutput === 'midi' || c.fromOutput == null));
        for (const edge of downstream) {
            const q = this._midiQueues.get(edge.to) || [];
            for (const ev of events) q.push(ev);
            this._midiQueues.set(edge.to, q);
        }
    }

    _handlePanic() {
        // Flush sequencer activeNotes (if any future use) & send All Notes Off to synths
        for (const [nid, entry] of this._sequencers.entries()) {
            if (entry.activeNotes && entry.activeNotes.size) {
                const offs = [];
                for (const n of entry.activeNotes.values()) offs.push({ data: [0x80, n & 0x7f, 0] });
                this._broadcastSequencerMIDI(nid, offs);
                entry.activeNotes.clear();
            }
        }
        for (const [nid, a] of this._arps.entries()) {
            if (a.activeOut && a.activeOut.size) {
                const offs = [];
                for (const n of a.activeOut.values()) offs.push({ data: [0x80, n & 0x7f, 0] });
                this._broadcastArpMIDI(nid, offs);
                a.activeOut.clear();
            }
        }
        this._queueAllNotesOffToAllSynths();
    }

    _getWaveformIndex(w: string): number {
        return WAVEFORM_INDEX[w as WaveformName] ?? 0;
    }

    _getOscInstance(nodeId: string): WasmOscillatorNode {
        let inst = this._oscInstances.get(nodeId);
        if (!inst) {
            inst = new this._wasm!.OscillatorNode(sampleRate);
            this._oscInstances.set(nodeId, inst);
        }
        return inst;
    }

    _getReverbInstance(nodeId: string): WasmReverbNode {
        let inst = this._reverbInstances.get(nodeId);
        if (!inst) {
            inst = new this._wasm!.ReverbNode(sampleRate);
            this._reverbInstances.set(nodeId, inst);
        }
        return inst;
    }

    _getSynthInstance(nodeId: string): WasmSynthNode | null {
        let inst = this._synthInstances.get(nodeId);
        if (!inst) {
            const Ctor = this._wasm && this._wasm.SynthNode;
            if (typeof Ctor !== "function") {
                this.port.postMessage({
                    type: "error",
                    message: "Cannot construct SynthNode; not a function",
                });
                return null;
            }
            inst = new Ctor(sampleRate);
            this._synthInstances.set(nodeId, inst);
        }
        return inst;
    }

    _getLfoInstance(nodeId: string): WasmLfoNode | null {
        let inst = this._lfoInstances.get(nodeId);
        if (!inst) {
            const Ctor = this._wasm && this._wasm.LfoNode;
            if (typeof Ctor !== 'function') return null;
            try { inst = new Ctor(sampleRate); } catch { return null; }
            this._lfoInstances.set(nodeId, inst);
        }
        return inst;
    }

    _getTransposeInstance(nodeId: string): WasmMidiTransposeNode | null {
        let inst = this._transposeInstances.get(nodeId);
        if (!inst) {
            const Ctor = this._wasm && this._wasm.MidiTransposeNode;
            if (typeof Ctor !== "function") return null;
            inst = new Ctor();
            this._transposeInstances.set(nodeId, inst);
        }
        return inst;
    }

    // Render Synth node audio into the provided output buffers
    _processSynth(nodeId: string, data: NodeData, outL: Float32Array, outR: Float32Array): void {
        const modded = this._applyParamModulations(nodeId, data);
        const N = outL.length;
        const synth = this._getSynthInstance(nodeId);
        if (!synth) return;
        try {
            const wf = this._getWaveformIndex((modded.waveform as string) || "sawtooth");
            synth.set_waveform?.(wf);
            if (typeof modded.maxVoices === "number")
                synth.set_max_voices?.(
                    Math.max(1, Math.min(32, (modded.maxVoices as number) | 0))
                );
            if (
                typeof modded.attack === "number" ||
                typeof modded.decay === "number" ||
                typeof modded.sustain === "number" ||
                typeof modded.release === "number"
            ) {
                const a = typeof modded.attack === "number" ? modded.attack as number : 0.005;
                const d = typeof modded.decay === "number" ? modded.decay as number : 0.12;
                const s = typeof modded.sustain === "number" ? modded.sustain as number : 0.7;
                const r =
                    typeof modded.release === "number" ? modded.release as number : 0.12;
                synth.set_adsr?.(a, d, s, r);
            }
            if (typeof modded.glide === "number") synth.set_glide?.(modded.glide as number);
            if (typeof modded.gain === "number") synth.set_gain?.(modded.gain as number);

            const temp = this._scratch.temp!;
            synth.process(temp);
            for (let i = 0; i < N; i++) {
                const s = temp[i];
                outL[i] += s;
                outR[i] += s;
            }
        } catch { }
    }

    // Deliver MIDI events to a Synth instance (Note On/Off handling)
    _processSynthMIDI(nodeId: string, events: MidiEvent[], _blockStartTimeSec: number, _blockSize: number): void {

        const synth =
            this._synthInstances.get(nodeId) || this._getSynthInstance(nodeId);
        if (!synth) return;
        for (const ev of events) {
            const [status, d1, d2] = ev.data;
            const cmd = status & 0xf0;
            switch (cmd) {
                case 0x90: // Note On
                    if ((d2 & 0x7f) > 0) {
                        synth.note_on?.(d1 & 0x7f, d2 & 0x7f);
                    } else {
                        synth.note_off?.(d1 & 0x7f); // treated as Note Off when velocity = 0
                    }
                    break;
                case 0x80: // Note Off
                    synth.note_off?.(d1 & 0x7f);
                    break;
                case 0xb0: {
                    // Control Change
                    const controller = d1 & 0x7f;
                    if (controller === 64) {
                        // Sustain pedal
                        const down = (d2 & 0x7f) >= 64;
                        synth.sustain_pedal?.(down);
                    } else if (controller === 123) {
                        // All Notes Off
                        if (typeof synth.all_notes_off === "function") {
                            try {
                                synth.all_notes_off();
                            } catch { }
                        } else {
                            // Fallback: manually send note_off for all notes
                            for (let n = 0; n < 128; n++) {
                                try {
                                    synth.note_off?.(n);
                                } catch { }
                            }
                        }
                    }
                    break;
                }
                default:
                    // ignore others for now
                    break;
            }
        }
    }

    _processTransposeMIDI(
        nodeId: string,
        data: NodeData,
        events: MidiEvent[],
    ): void {
        const modded = this._applyParamModulations(nodeId, data);
        const inst = this._getTransposeInstance(nodeId);
        if (!inst) return;
        const semitones =
            typeof modded.semitones === "number" ? (modded.semitones as number) : 0;
        const clampLow = typeof modded.clampLow === "number" ? (modded.clampLow as number) : 0;
        const clampHigh =
            typeof modded.clampHigh === "number" ? (modded.clampHigh as number) : 127;
        const passOther = !!modded.passOther;
        try {
            inst.set_params?.(semitones, clampLow, clampHigh, passOther);
        } catch { }

        let state = this._transposeNoteState.get(nodeId);
        if (!state) {
            state = { active: new Map(), lastSemitones: semitones };
            this._transposeNoteState.set(nodeId, state);
        }

        const outEvents = [];

        // If semitones changed flush currently active notes
        if (state.lastSemitones !== semitones) {
            for (const [key, transposedNote] of state.active.entries()) {
                const channel = (key >> 7) & 0x0f;
                outEvents.push({
                    data: [0x80 | channel, transposedNote & 0x7f, 0],
                });
            }
            state.active.clear();
            state.lastSemitones = semitones;
        }

        for (const ev of events) {
            const d = ev.data;
            if (!d || d.length < 3) continue;
            const status = d[0] & 0xff;
            const cmd = status & 0xf0;
            const channel = status & 0x0f; // 0-15
            if (cmd === 0x90) {
                const origNote = d[1] & 0x7f;
                const vel = d[2] & 0x7f;
                if (vel > 0) {
                    try {
                        const res = inst.transform(status, origNote, vel);
                        if (res && res.length === 3) {
                            const transposedNote = res[1] & 0x7f;
                            const key = (channel << 7) | origNote;
                            state.active.set(key, transposedNote);
                            outEvents.push({
                                data: [
                                    res[0] & 0xff,
                                    transposedNote,
                                    res[2] & 0x7f,
                                ],
                            });
                        }
                    } catch { }
                } else {
                    const key = (channel << 7) | origNote;
                    const transposedNote = state.active.get(key);
                    if (transposedNote != null) {
                        outEvents.push({
                            data: [0x80 | channel, transposedNote, 0],
                        });
                        state.active.delete(key);
                    } else {
                        try {
                            const res = inst.transform(status, origNote, 0);
                            if (res && res.length === 3)
                                outEvents.push({
                                    data: [0x80 | channel, res[1] & 0x7f, 0],
                                });
                        } catch { }
                    }
                }
            } else if (cmd === 0x80) {
                const origNote = d[1] & 0x7f;
                const key = (channel << 7) | origNote;
                const transposedNote = state.active.get(key);
                if (transposedNote != null) {
                    outEvents.push({
                        data: [0x80 | channel, transposedNote, 0],
                    });
                    state.active.delete(key);
                } else {
                    try {
                        const res = inst.transform(
                            status,
                            origNote,
                            d[2] & 0x7f
                        );
                        if (res && res.length === 3)
                            outEvents.push({
                                data: [0x80 | channel, res[1] & 0x7f, 0],
                            });
                    } catch { }
                }
            } else {
                if (passOther) {
                    try {
                        const res = inst.transform(
                            status,
                            d[1] & 0x7f,
                            d[2] & 0x7f
                        );
                        if (res && res.length === 3)
                            outEvents.push({
                                data: [
                                    res[0] & 0xff,
                                    res[1] & 0x7f,
                                    res[2] & 0x7f,
                                ],
                            });
                    } catch { }
                }
            }
        }
        if (!outEvents.length) return;
        const downstream = this._connections.filter(
            (c) =>
                c.from === nodeId &&
                (c.fromOutput === "midi-out" ||
                    c.fromOutput === "midi" ||
                    c.fromOutput == null)
        );
        for (const edge of downstream) {
            const q = this._midiQueues.get(edge.to) || [];
            for (const ev of outEvents) q.push(ev);
            this._midiQueues.set(edge.to, q);
        }
    }

    _propagateValueNodes() {
        if (!this._paramConnections || !this._paramConnections.length) return;
        // Collect connections that target value nodes (used as pass-through signal sources).
        const valueTargets = this._paramConnections.filter(m => {
            const n = this._nodes.get(m.to);
            return n && typeof n.type === 'string' && n.type.startsWith('value-');
        });
        if (!valueTargets.length) return;
        // Lazy-init cache: tracks last value actually sent via modPreview, keyed by
        // connection identity. This is independent of _nodes, which React's node-sync
        // periodically resets to the React-state value (causing false "no-change" skips).
        if (!this._propagatedValues) this._propagatedValues = new Map();
        // Propagate up to 4 levels deep to handle chained value nodes.
        for (let pass = 0; pass < 4; pass++) {
            let anyChanged = false;
            for (const m of valueTargets) {
                const srcNode = this._nodes.get(m.from);
                if (!srcNode) continue;
                const targetNode = this._nodes.get(m.to);
                if (!targetNode) continue;
                // Determine which field to read from the source
                const outKey = m.fromOutput && m.fromOutput !== 'param-out' && m.fromOutput !== 'output'
                    ? m.fromOutput : 'value';
                const raw = srcNode[outKey];
                if (raw === undefined || raw === null) continue;
                // Always write into _nodes so downstream chains (pass 1, 2...) see the updated value.
                const prevNodeVal = targetNode[m.targetParam];
                if (prevNodeVal !== raw) {
                    this._nodes.set(m.to, { ...targetNode, [m.targetParam]: raw });
                    anyChanged = true;
                }
                // Use the propagated-values cache (not _nodes) to determine if we should notify the UI.
                // _nodes gets reset by React's sync, so it is not a reliable signal for "did value change".
                const cacheKey = `${m.from}:${m.to}:${m.targetParam}`;
                if (this._propagatedValues.get(cacheKey) !== raw) {
                    this._propagatedValues.set(cacheKey, raw);
                    try { this.port.postMessage({ type: 'modPreview', nodeId: m.to, data: { [m.targetParam]: raw } }); } catch { }
                }
            }
            if (!anyChanged) break; // converged — no further chain propagation needed
        }
    }

    _applyParamModulations(nodeId: string, data: NodeData): NodeData {
        if (!this._paramConnections || !this._paramConnections.length) return data;
        const relevant = this._paramConnections.filter(m => m.to === nodeId);
        if (!relevant.length) return data;

        const modAccum: Record<string, unknown> = {};
        const hasDirect = new Set<string>();
        const lfos: ParamConnection[] = [];

        for (const m of relevant) {
            const srcNode = this._nodes.get(m.from);
            if (!srcNode) continue;

            if (srcNode.type === 'lfo') {
                lfos.push(m);
            } else {
                // Direct value node — use its raw value (preserving boolean)
                const outKey = m.fromOutput && m.fromOutput !== 'param-out' && m.fromOutput !== 'output' ? m.fromOutput : 'value';
                const raw = srcNode[outKey];
                if (typeof raw === 'boolean') {
                    modAccum[m.targetParam] = raw;
                    hasDirect.add(m.targetParam);
                } else {
                    const v = Number(raw);
                    // Direct nodes OVERRIDE the baseline parameter value
                    if (!hasDirect.has(m.targetParam)) {
                        modAccum[m.targetParam] = isFinite(v) ? v : 0;
                        hasDirect.add(m.targetParam);
                    } else {
                        // If multiple direct nodes target the same param, they sum together
                        (modAccum[m.targetParam] as number) += isFinite(v) ? v : 0;
                    }
                }
            }
        }

        // Apply LFOs
        for (const m of lfos) {
            const v = this._lfoValues.get(m.from) || 0;
            if (modAccum[m.targetParam] === undefined) {
                // Not overridden by direct nodes? Use base value.
                modAccum[m.targetParam] = Number(data[m.targetParam]) || 0;
            }
            if (typeof modAccum[m.targetParam] === 'number') {
                (modAccum[m.targetParam] as number) += v;
            }
        }

        if (Object.keys(modAccum).length) {
            const patched = { ...data, ...modAccum };
            // Since modAccum now represents the TRUE absolute value computed by the engine, emit it for UI previews
            try { this.port.postMessage({ type: 'modPreview', nodeId, data: modAccum }); } catch { }
            return patched as NodeData;
        }
        return data;
    }

    _processOscillator(nodeId: string, data: NodeData, outL: Float32Array, outR: Float32Array): void {
        const modded = this._applyParamModulations(nodeId, data);
        const N = outL.length;
        const osc = this._getOscInstance(nodeId);
        try {
            if (typeof modded.frequency === "number")
                osc.frequency = modded.frequency as number;
            if (typeof modded.amplitude === "number")
                osc.amplitude = modded.amplitude as number;
            osc.set_waveform(this._getWaveformIndex((modded.waveform as string) || "sine"));

            const temp = this._scratch.temp!;
            osc.process(temp);
            for (let i = 0; i < N; i++) {
                const s = temp[i];
                outL[i] += s;
                outR[i] += s;
            }
        } catch {
            /* ignore per-block errors */
        }
    }

    _processReverb(nodeId: string, data: NodeData, outL: Float32Array, outR: Float32Array, visited: Set<string>): void {
        const modded = this._applyParamModulations(nodeId, data);
        // Only treat audio edges into main audio input
        const inputs = this._connections.filter(
            (c) =>
                c.to === nodeId &&
                c.toInput === "input" &&
                (c.fromOutput === "output" || !c.fromOutput)
        );
        if (inputs.length === 0) return;

        const N = outL.length;
        const inL = this._scratch.inL!;
        const inR = this._scratch.inR!;
        inL.fill(0);
        inR.fill(0);

        for (const c of inputs) {
            const src = this._nodes.get(c.from);
            if (!src) continue;
            this._processInputNode(c.from, src, inL, inR, visited);
        }

        const rev = this._getReverbInstance(nodeId);
        try {
            if (typeof modded.feedback === "number") rev.feedback = modded.feedback as number;
            if (typeof modded.wetMix === "number") rev.wet_mix = modded.wetMix as number;

            const temp = this._scratch.temp!;
            // Use left as mono input for now
            rev.process(inL, temp);

            for (let i = 0; i < N; i++) {
                const s = temp[i];
                outL[i] += s;
                outR[i] += s;
            }
        } catch {
            /* ignore per-block errors */
        }
    }

    // Recursively process an input node and mix into outL/outR
    _processInputNode(nodeId: string, data: NodeData, outL: Float32Array, outR: Float32Array, visited: Set<string> = new Set()): void {
        if (!data || !data.type) return;
        if (visited.has(nodeId)) return; // break cycles
        visited.add(nodeId);

        switch (data.type) {
            case "oscillator":
                this._processOscillator(nodeId, data, outL, outR);
                break;
            case "synth":
                this._processSynth(nodeId, data, outL, outR);
                break;
            case "reverb":
                this._processReverb(nodeId, data, outL, outR, visited);
                break;
            // midi transpose has no audio output
            default:
                break;
        }
    }

    // Entry point: render graph by starting at speaker sinks and mixing upstream
    _processGraph(outL: Float32Array, outR: Float32Array): void {
        const speakers = [];
        for (const [nodeId, data] of this._nodes.entries()) {
            if (data && data.type === "speaker") {
                speakers.push({ nodeId, data });
            }
        }

        if (speakers.length === 0) {
            // No explicit sinks; keep silent output (outL/outR already cleared)
            return;
        }

        const N = outL.length;
        for (const { nodeId, data } of speakers) {
            const sumL = this._scratch.sumL!;
            const sumR = this._scratch.sumR!;
            sumL.fill(0);
            sumR.fill(0);

            // Find audio inputs wired into the speaker
            const inputs = this._connections.filter(
                (c) =>
                    c.to === nodeId &&
                    c.toInput === "input" &&
                    (c.fromOutput === "output" || !c.fromOutput)
            );

            for (const c of inputs) {
                const src = this._nodes.get(c.from);
                if (!src) continue;
                this._processInputNode(c.from, src, sumL, sumR, new Set());
            }

            let gain = 1.0;
            if (typeof data.volume === "number") gain = data.volume;
            if (data.muted) gain = 0;

            for (let i = 0; i < N; i++) {
                outL[i] += sumL[i] * gain;
                outR[i] += sumR[i] * gain;
            }
        }
    }

    // Broadcast MIDI events from a sequencer node to its downstream MIDI connections
    _broadcastSequencerMIDI(nodeId: string, events: MidiEvent[]): void {
        if (!Array.isArray(events) || !events.length) return;
        const downstream = this._connections.filter(
            (c) =>
                c.from === nodeId &&
                (c.fromOutput === "midi-out" || c.fromOutput === "midi" || c.fromOutput == null)
        );
        for (const edge of downstream) {
            const q = this._midiQueues.get(edge.to) || [];
            for (const ev of events) q.push(ev);
            this._midiQueues.set(edge.to, q);
        }
    }
}

// Correct registration name expected by AudioManager
registerProcessor("audio-engine-processor", EngineProcessor);
