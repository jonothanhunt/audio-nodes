// core-audio/worklet/audio-engine-processor.ts
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
const _global = globalThis as Record<string, unknown>;

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
// Gain smoothing
// ---------------------------------------------------------------------------

/** Distance below which a gain snaps to its target rather than creeping. -80 dB. */
const GAIN_SETTLE_EPSILON = 1e-4;

/**
 * One-pole smoothed gain, ticked per sample.
 *
 * Every gain in this file used to be applied as a bare multiply that could change between
 * render quanta. A gain that steps once per 128 samples is a ~344 Hz square wave riding on
 * the signal: a click on a mute, zipper noise on a slider drag, and a hard pop whenever a
 * node joins or leaves the mix mid-waveform. Ramping through the block removes all three.
 */
class SmoothedGain {
    current: number;
    target: number;
    private coeff: number;

    constructor(initial: number, timeConstantSec: number) {
        this.current = initial;
        this.target = initial;
        const dt = 1 / sampleRate;
        this.coeff = timeConstantSec <= 0 ? 1 : dt / (timeConstantSec + dt);
    }

    setTarget(value: number): void {
        if (Number.isFinite(value)) this.target = value;
    }

    /** Jump without ramping — only correct when there is no signal to discontinue. */
    snap(value: number): void {
        if (Number.isFinite(value)) {
            this.current = value;
            this.target = value;
        }
    }

    get isSettled(): boolean {
        return this.current === this.target;
    }

    /** Converged on zero: the node is silent and safe to drop. */
    get isSilent(): boolean {
        return this.target === 0 && this.current === 0;
    }

    /**
     * Advance one sample.
     *
     * A one-pole approach never quite arrives, so the last stretch is snapped once the
     * remaining distance is inaudible (-80 dB). Without it a faded-out node would sit at a
     * small non-zero gain forever and never be retired.
     */
    tick(): number {
        const remaining = this.target - this.current;
        if (Math.abs(remaining) < GAIN_SETTLE_EPSILON) {
            this.current = this.target;
        } else {
            this.current += remaining * this.coeff;
        }
        return this.current;
    }
}

/**
 * Fade applied when a node starts or stops contributing to the mix (a patch change, a node
 * added or deleted). Long enough to remove the click, short enough to feel immediate.
 */
const NODE_FADE_SEC = 0.008;

/** Speaker volume/mute smoothing. Mute is the loudest click in the app without this. */
const SPEAKER_GAIN_SMOOTHING_SEC = 0.010;

/**
 * A faded-out node is kept alive this long (in blocks) before its WASM instance is freed,
 * so a reverb tail or a synth release can ring out instead of being cut off.
 */
const TEARDOWN_GRACE_BLOCKS = 512;

/** Below this peak a lingering tail is inaudible and the instance can go. */
const TAIL_SILENCE_THRESHOLD = 1e-4;

/**
 * `modPreview` messages exist to drive number readouts in the UI. They used to be posted
 * every block per modulated node (~344/sec each), which flooded the main thread and
 * triggered a React re-render per message. 30 Hz is past what the eye resolves.
 */
const MOD_PREVIEW_INTERVAL_SEC = 1 / 30;

// ---------------------------------------------------------------------------
// Render plan
// ---------------------------------------------------------------------------

/**
 * Everything about the graph that `process()` needs, derived once per graph change instead
 * of being re-filtered out of `_connections` on every 128-sample quantum.
 */
interface RenderPlan {
    /** Speaker sink node ids. */
    speakers: string[];
    /** Audio source node ids feeding each node's main audio input, in connection order. */
    audioInputs: Map<string, string[]>;
    /** Audio-producing nodes reachable from a speaker, in depth-first (post-order) order. */
    reachable: Set<string>;
    /** LFO node ids, evaluated once per block. */
    lfoNodes: string[];
    /** Param modulations grouped by destination node. */
    paramModsByTarget: Map<string, ParamConnection[]>;
    /** MIDI destinations per source node id. */
    midiDownstream: Map<string, string[]>;
    /** Param connections whose destination is a value/logic node, in dependency order. */
    valueEdges: ParamConnection[];
    /** Value/logic node ids in dependency order, for the propagation pass. */
    valueNodeOrder: string[];
}

const EMPTY_STRINGS: string[] = [];
const EMPTY_PARAM_CONNECTIONS: ParamConnection[] = [];

/** Handle ids that carry audio or MIDI rather than naming a parameter. */
const NON_PARAM_HANDLES = new Set([
    'input',
    'output',
    'midi',
    'midi-out',
    'audio-in',
    'audio-out',
]);

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

    private _transposeNoteState: Map<string, TransposeNoteState>;
    private _transport: Transport;
    private _captureActive: boolean;
    private _sequencers: Map<string, SequencerEntry>;
    private _arps: Map<string, ArpEntry>;

    // --- Render plan (see RenderPlan) ---
    private _plan: RenderPlan;
    private _planDirty: boolean;
    /**
     * The audio adjacency and speaker list the last plan actually rendered, including any
     * retiring entries. Fading a node out means continuing to render it into the destination
     * it *used* to feed, so the previous topology has to outlive the edit that removed it.
     */
    private _lastAudioInputs: Map<string, string[]>;
    private _lastSpeakers: string[];
    /** Last-known data for nodes deleted from the graph but still fading out. */
    private _retiredNodeData: Map<string, NodeData>;

    // --- Buffer pool ---
    // Reverb recursion needs its own input buffer per level. These used to be five fixed
    // scratch buffers on the processor, which meant a reverb feeding another reverb had the
    // inner call zero the buffer the outer call was still accumulating into.
    private _bufferPool: Float32Array[];
    private _bufferSize: number;

    // --- Per-block render cache ---
    // A node feeding two destinations must render exactly once per quantum. Rendering it
    // twice advanced its oscillator phase twice, which sounded an octave up.
    private _renderedL: Map<string, Float32Array>;
    private _renderedR: Map<string, Float32Array>;
    private _blockBuffers: Float32Array[];

    // --- Fade envelopes ---
    /** Per-node fade gain, so nodes never enter or leave the mix at full amplitude. */
    private _nodeGains: Map<string, SmoothedGain>;
    /** Per-speaker volume/mute gain. */
    private _speakerGains: Map<string, SmoothedGain>;
    /** Nodes fading out after leaving the graph, with the block count since they left. */
    private _fadingOut: Map<string, number>;

    /**
     * MIDI events waiting to be applied to a synth, each tagged with the frame within the
     * current block at which it should take effect. Sorted by frame.
     */
    private _pendingSynthEvents: Map<string, Array<{ frame: number; data: number[] }>>;

    // --- Param modulation ---
    /** Reused per-node patched-data objects, so modulation allocates nothing per block. */
    private _moddedData: Map<string, NodeData>;
    /** Values accumulated for the next batched modPreview message. */
    private _previewPending: Map<string, Record<string, number | boolean>>;
    private _previewLastSentSec: number;
    private _previewDirty: boolean;

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

        this._plan = {
            speakers: [],
            audioInputs: new Map(),
            reachable: new Set(),
            lfoNodes: [],
            paramModsByTarget: new Map(),
            midiDownstream: new Map(),
            valueEdges: [],
            valueNodeOrder: [],
        };
        this._planDirty = true;
        this._lastAudioInputs = new Map();
        this._lastSpeakers = [];
        this._retiredNodeData = new Map();

        this._bufferPool = [];
        this._bufferSize = 0;
        this._renderedL = new Map();
        this._renderedR = new Map();
        this._blockBuffers = [];

        this._nodeGains = new Map();
        this._speakerGains = new Map();
        this._fadingOut = new Map();

        this._pendingSynthEvents = new Map();
        this._moddedData = new Map();
        this._previewPending = new Map();
        this._previewLastSentSec = 0;
        this._previewDirty = false;

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

    /** The pending MIDI queue for a node, created on first use. */
    _queueFor(nodeId: string): MidiEvent[] {
        let q = this._midiQueues.get(nodeId);
        if (!q) {
            q = [];
            this._midiQueues.set(nodeId, q);
        }
        return q;
    }

    // Queue All Notes Off (CC 123) to all synth nodes to ensure hanging notes are stopped
    _queueAllNotesOffToAllSynths() {
        for (const [nid, data] of this._nodes.entries()) {
            if (!data || data.type !== "synth") continue;
            const q = this._queueFor(nid);
            for (let ch = 0; ch < 16; ch++) {
                q.push({ data: [0xb0 | ch, 123, 0] }); // CC 123 All Notes Off
            }
        }
    }

    /** Send events to every MIDI destination of `nodeId`, per the render plan. */
    _fanOutMIDI(nodeId: string, events: MidiEvent[]): void {
        if (!events.length) return;
        for (const targetId of this._plan.midiDownstream.get(nodeId) ?? EMPTY_STRINGS) {
            const q = this._queueFor(targetId);
            for (const ev of events) q.push(ev);
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
                '\ntry { globalThis.OscillatorNode = typeof OscillatorNode !== "undefined" ? OscillatorNode : globalThis.OscillatorNode; } catch(_){}';
            code +=
                '\ntry { globalThis.ReverbNode = typeof ReverbNode !== "undefined" ? ReverbNode : globalThis.ReverbNode; } catch(_){}';
            code +=
                '\ntry { globalThis.SynthNode = typeof SynthNode !== "undefined" ? SynthNode : globalThis.SynthNode; } catch(_){}';
            code +=
                '\ntry { globalThis.MidiTransposeNode = typeof MidiTransposeNode !== "undefined" ? MidiTransposeNode : globalThis.MidiTransposeNode; } catch(_){}';
            code +=
                '\ntry { globalThis.LfoNode = typeof LfoNode !== "undefined" ? LfoNode : globalThis.LfoNode; } catch(_){}';
            new Function(code)();
            if (typeof _global.__wbg_init_default !== "function") {
                throw new Error(
                    "WASM init function not found after transforming glue"
                );
            }
            // wasm-bindgen >= 0.2.113 wants a single options object; passing the bytes
            // positionally still works but logs a deprecation warning on every load.
            await (_global.__wbg_init_default as (opts: { module_or_path: ArrayBuffer }) => Promise<void>)({
                module_or_path: wasmBytes,
            });
            this._wasm = {
                OscillatorNode: _global.OscillatorNode as WasmOscillatorNodeConstructor,
                ReverbNode: _global.ReverbNode as WasmReverbNodeConstructor,
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
                // A new or retyped node changes what the render plan must cover. Position-only
                // updates never reach here (see useNodeSync), so this stays cheap.
                this._planDirty = true;
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
                        const downstream = this._plan.midiDownstream.get(nodeId);
                        if (downstream && downstream.length) {
                            this._fanOutMIDI(nodeId, outEvents);
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
                // Drop the node from the graph, but leave its WASM instances alone. The
                // render plan will see it is no longer reachable, fade it out over
                // NODE_FADE_SEC, and only then free it (_collectFadedOutNodes) — otherwise
                // deleting a reverb chops its tail dead and deleting a synth cuts every
                // sounding note mid-cycle.
                const removed = this._nodes.get(nodeId);
                if (removed) this._retiredNodeData.set(nodeId, removed);
                this._nodes.delete(nodeId);
                this._paramCache.delete(nodeId);
                this._planDirty = true;
                break;
            }
            case "updateConnections": {
                const { connections } = msg;
                this._connections = Array.isArray(connections)
                    ? connections
                    : [];
                // Param connections, audio adjacency, MIDI fan-out and reachability are all
                // derived together in _rebuildRenderPlan on the next block.
                this._planDirty = true;
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
                for (const inst of this._lfoInstances.values()) {
                    try {
                        inst.free?.();
                    } catch { }
                }
                this._oscInstances.clear();
                this._reverbInstances.clear();
                this._synthInstances.clear();
                this._transposeInstances.clear();
                this._lfoInstances.clear();
                this._transposeNoteState.clear();
                this._midiQueues.clear();
                this._nodeGains.clear();
                this._speakerGains.clear();
                this._fadingOut.clear();
                this._moddedData.clear();
                this._previewPending.clear();
                this._retiredNodeData.clear();
                this._lastAudioInputs.clear();
                this._lastSpeakers.length = 0;
                this._planDirty = true;
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
                if (!Array.isArray(events)) break;
                if (this._planDirty) this._rebuildRenderPlan();
                for (const targetId of this._plan.midiDownstream.get(sourceId) ?? EMPTY_STRINGS) {
                    const q = this._queueFor(targetId);
                    for (const ev of events) {
                        if (!ev || !Array.isArray(ev.data)) continue;
                        q.push({
                            data: ev.data.slice(0, 3),
                            atFrame: ev.atFrame,
                            atTimeMs: ev.atTimeMs,
                        });
                    }
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

    // -----------------------------------------------------------------------
    // Render plan
    // -----------------------------------------------------------------------

    /**
     * Derive everything `process()` needs from `_nodes` + `_connections`.
     *
     * Called only when the graph changes. Previously each of these lookups was an
     * `Array.prototype.filter` executed inside the render callback, once per node, once per
     * quantum — so ~344 array allocations per second per node, all of it garbage for the GC
     * to collect during audio rendering.
     */
    _rebuildRenderPlan(): void {
        const plan = this._plan;
        plan.speakers.length = 0;
        plan.lfoNodes.length = 0;
        plan.valueEdges.length = 0;
        plan.valueNodeOrder.length = 0;
        plan.audioInputs.clear();
        plan.paramModsByTarget.clear();
        plan.midiDownstream.clear();
        plan.reachable.clear();

        const liveSpeakers: string[] = [];
        for (const [nodeId, data] of this._nodes.entries()) {
            if (!data || typeof data.type !== 'string') continue;
            if (data.type === 'speaker') liveSpeakers.push(nodeId);
            else if (data.type === 'lfo') plan.lfoNodes.push(nodeId);
        }

        // Audio adjacency and MIDI fan-out as the graph currently stands.
        const liveAudioInputs = new Map<string, string[]>();
        for (const c of this._connections) {
            const isAudioEdge =
                c.toInput === 'input' && (c.fromOutput === 'output' || !c.fromOutput);
            if (isAudioEdge) {
                let list = liveAudioInputs.get(c.to);
                if (!list) {
                    list = [];
                    liveAudioInputs.set(c.to, list);
                }
                list.push(c.from);
                continue;
            }

            const isMidiEdge =
                c.fromOutput === 'midi-out' || c.fromOutput === 'midi' || c.fromOutput == null;
            if (isMidiEdge) {
                let list = plan.midiDownstream.get(c.from);
                if (!list) {
                    list = [];
                    plan.midiDownstream.set(c.from, list);
                }
                list.push(c.to);
            }
        }

        // Param modulations: any edge landing on a handle that names a parameter.
        this._paramConnections.length = 0;
        for (const c of this._connections) {
            if (!c.toInput || NON_PARAM_HANDLES.has(c.toInput)) continue;
            const targetParam = c.toInput.startsWith('param-') ? c.toInput.substring(6) : c.toInput;
            const mod: ParamConnection = {
                from: c.from,
                to: c.to,
                fromOutput: c.fromOutput,
                targetParam,
            };
            this._paramConnections.push(mod);

            let list = plan.paramModsByTarget.get(c.to);
            if (!list) {
                list = [];
                plan.paramModsByTarget.set(c.to, list);
            }
            list.push(mod);

            const target = this._nodes.get(c.to);
            if (target && typeof target.type === 'string' &&
                (target.type.startsWith('value-') || target.type.startsWith('logic-'))) {
                plan.valueEdges.push(mod);
            }
        }

        this._buildValueNodeOrder(plan);
        this._mergeRetiringTopology(plan, liveAudioInputs, liveSpeakers);
        this._computeReachableAudioNodes(plan);
        this._syncNodeFadeTargets(plan, liveAudioInputs, liveSpeakers);
        this._planDirty = false;
    }

    /**
     * Fold the previous topology's still-audible parts into the plan.
     *
     * Cutting a cable or deleting a node removes the route its signal was travelling along,
     * so simply dropping it from the plan makes the signal stop between one sample and the
     * next — the pop. Instead the removed edge (and, for a deleted sink, the speaker itself)
     * stays in the plan until the source's fade gain reaches zero. `_collectFadedOutNodes`
     * then marks the plan dirty so the stale entries are dropped on the next block.
     */
    _mergeRetiringTopology(
        plan: RenderPlan,
        liveAudioInputs: Map<string, string[]>,
        liveSpeakers: string[],
    ): void {
        for (const [to, froms] of liveAudioInputs) plan.audioInputs.set(to, froms.slice());
        plan.speakers.push(...liveSpeakers);

        for (const [to, froms] of this._lastAudioInputs) {
            for (const from of froms) {
                if (liveAudioInputs.get(to)?.includes(from)) continue; // still connected
                const gain = this._nodeGains.get(from);
                if (!gain || gain.isSilent) continue; // already faded; let it go
                let list = plan.audioInputs.get(to);
                if (!list) {
                    list = [];
                    plan.audioInputs.set(to, list);
                }
                if (!list.includes(from)) list.push(from);
            }
        }

        for (const speakerId of this._lastSpeakers) {
            if (plan.speakers.includes(speakerId)) continue;
            const gain = this._speakerGains.get(speakerId);
            if (!gain || gain.isSilent) continue;
            plan.speakers.push(speakerId);
        }

        // Carry the merged topology forward, so a retiring edge survives further edits until
        // it has actually gone quiet.
        this._lastAudioInputs = new Map(plan.audioInputs);
        this._lastSpeakers = plan.speakers.slice();
    }

    /**
     * Order the value/logic nodes so a single evaluation pass resolves a whole chain
     * (Bool → Add → Multiply → destination). The old code brute-forced this with a
     * four-pass fixpoint every block; a topological order gets it right in one pass, and
     * cycles fall back to source order rather than spinning.
     */
    _buildValueNodeOrder(plan: RenderPlan): void {
        const dependencies = new Map<string, string[]>();
        for (const [nodeId, data] of this._nodes.entries()) {
            if (!data || typeof data.type !== 'string') continue;
            if (!data.type.startsWith('value-') && !data.type.startsWith('logic-')) continue;
            dependencies.set(nodeId, []);
        }
        for (const edge of plan.valueEdges) {
            const deps = dependencies.get(edge.to);
            if (deps && dependencies.has(edge.from)) deps.push(edge.from);
        }

        const visiting = new Set<string>();
        const done = new Set<string>();
        const visit = (nodeId: string): void => {
            if (done.has(nodeId) || visiting.has(nodeId)) return; // cycle: leave as-is
            visiting.add(nodeId);
            for (const dep of dependencies.get(nodeId) ?? EMPTY_STRINGS) visit(dep);
            visiting.delete(nodeId);
            done.add(nodeId);
            plan.valueNodeOrder.push(nodeId);
        };
        for (const nodeId of dependencies.keys()) visit(nodeId);
    }

    /**
     * Nodes that get rendered this block: everything reachable from a speaker across the
     * merged (live + retiring) topology.
     */
    _computeReachableAudioNodes(plan: RenderPlan): void {
        const walk = (nodeId: string): void => {
            if (plan.reachable.has(nodeId)) return;
            if (!this._dataForRender(nodeId)) return;
            plan.reachable.add(nodeId);
            for (const src of plan.audioInputs.get(nodeId) ?? EMPTY_STRINGS) walk(src);
        };
        for (const speakerId of plan.speakers) {
            for (const src of plan.audioInputs.get(speakerId) ?? EMPTY_STRINGS) walk(src);
        }
    }

    /**
     * Node data for rendering, falling back to the snapshot taken when the node was deleted.
     * A node mid-fade still has to render — that is what makes the fade (and a reverb tail)
     * audible rather than theoretical.
     */
    _dataForRender(nodeId: string): NodeData | undefined {
        return this._nodes.get(nodeId) ?? this._retiredNodeData.get(nodeId);
    }

    /**
     * Point every node's fade gain at where it should be heading.
     *
     * A node that just became reachable fades up from silence; one that stopped being
     * reachable fades down and enters `_fadingOut`, which keeps its WASM instance alive
     * until the fade completes and any tail has decayed. Without this, connecting or
     * disconnecting anything dropped a full-amplitude waveform edge into the mix.
     */
    _syncNodeFadeTargets(
        plan: RenderPlan,
        liveAudioInputs: Map<string, string[]>,
        liveSpeakers: string[],
    ): void {
        // "Held" means reachable through edges that still exist. Anything only reachable via
        // a retiring edge is on its way out and gets a target of zero.
        const held = new Set<string>();
        const walk = (nodeId: string): void => {
            if (held.has(nodeId)) return;
            if (!this._nodes.has(nodeId)) return;
            held.add(nodeId);
            for (const src of liveAudioInputs.get(nodeId) ?? EMPTY_STRINGS) walk(src);
        };
        for (const speakerId of liveSpeakers) {
            for (const src of liveAudioInputs.get(speakerId) ?? EMPTY_STRINGS) walk(src);
        }

        for (const nodeId of held) {
            let gain = this._nodeGains.get(nodeId);
            if (!gain) {
                gain = new SmoothedGain(0, NODE_FADE_SEC);
                this._nodeGains.set(nodeId, gain);
            }
            gain.setTarget(1);
            this._fadingOut.delete(nodeId);
        }

        for (const [nodeId, gain] of this._nodeGains.entries()) {
            if (held.has(nodeId)) continue;
            gain.setTarget(0);
            if (!this._fadingOut.has(nodeId)) this._fadingOut.set(nodeId, 0);
        }
    }

    /**
     * Free the WASM instances of nodes that have finished fading out.
     *
     * Teardown is deferred rather than done in the `removeNode` handler so a reverb tail or
     * a synth release can ring out. A node re-added before its grace period expires keeps
     * its state, which is what you want when you accidentally cut a cable and reconnect it.
     */
    _collectFadedOutNodes(): void {
        if (!this._fadingOut.size) return;
        for (const [nodeId, blocks] of this._fadingOut.entries()) {
            const gain = this._nodeGains.get(nodeId);
            if (gain && !gain.isSilent) continue;

            const elapsed = blocks + 1;
            this._fadingOut.set(nodeId, elapsed);

            const stillRinging = elapsed < TEARDOWN_GRACE_BLOCKS && this._hasAudibleTail(nodeId);
            if (stillRinging) continue;

            // The node is gone from the graph entirely: drop its instances. If it is still
            // present but merely disconnected, keep them so reconnecting is seamless.
            if (!this._nodes.has(nodeId)) {
                this._freeNodeInstances(nodeId);
                this._nodeGains.delete(nodeId);
                this._retiredNodeData.delete(nodeId);
            }
            this._fadingOut.delete(nodeId);
            // The retiring edges that kept this node rendering can now be dropped.
            this._planDirty = true;
        }
    }

    /** True while a node's internal state (reverb delay line, synth voices) still sounds. */
    _hasAudibleTail(nodeId: string): boolean {
        const reverb = this._reverbInstances.get(nodeId);
        if (reverb && typeof reverb.tail_peak === 'function') {
            try {
                if (reverb.tail_peak() > TAIL_SILENCE_THRESHOLD) return true;
            } catch { }
        }
        const synth = this._synthInstances.get(nodeId);
        if (synth && typeof synth.is_active === 'function') {
            try {
                if (synth.is_active()) return true;
            } catch { }
        }
        return false;
    }

    _freeNodeInstances(nodeId: string): void {
        for (const map of [
            this._oscInstances,
            this._reverbInstances,
            this._synthInstances,
            this._transposeInstances,
            this._lfoInstances,
        ] as Array<Map<string, WasmFreeable>>) {
            const inst = map.get(nodeId);
            if (inst) {
                try { inst.free?.(); } catch { }
                map.delete(nodeId);
            }
        }
        this._transposeNoteState.delete(nodeId);
        this._moddedData.delete(nodeId);
    }

    // -----------------------------------------------------------------------
    // Buffer pool
    // -----------------------------------------------------------------------

    _ensureBufferSize(blockSize: number): void {
        if (this._bufferSize === blockSize) return;
        this._bufferSize = blockSize;
        this._bufferPool.length = 0;
        this._blockBuffers.length = 0;
    }

    _acquireBuffer(): Float32Array {
        const buf = this._bufferPool.pop();
        if (buf) {
            buf.fill(0);
            return buf;
        }
        return new Float32Array(this._bufferSize);
    }

    _releaseBuffer(buf: Float32Array): void {
        this._bufferPool.push(buf);
    }

    /**
     * A buffer that lives for the rest of the block. Used by the render cache, and returned
     * to the pool wholesale in `_endBlock`.
     */
    _acquireBlockBuffer(): Float32Array {
        const buf = this._acquireBuffer();
        this._blockBuffers.push(buf);
        return buf;
    }

    _endBlock(): void {
        for (const buf of this._blockBuffers) this._releaseBuffer(buf);
        this._blockBuffers.length = 0;
        this._renderedL.clear();
        this._renderedR.clear();
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
            this._ensureBufferSize(blockSize);
            // Recompute the graph derivation only when it actually changed, rather than
            // re-filtering `_connections` for every node on every quantum.
            if (this._planDirty) this._rebuildRenderPlan();

            // Approximate current audio time for this block
            const blockStartTimeSec = this._timebase.audioCurrentTimeSec; // updated when host sends timebase; coarse but fine for scheduling

            // Pre-evaluate all LFO nodes once per block
            this._lfoValues.clear();
            for (const nid of this._plan.lfoNodes) {
                const lfoNode = this._nodes.get(nid);
                if (!lfoNode) continue;
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
                        // Whatever is left over is how far past the step boundary this block
                        // already ran, so the step actually fell that many frames before the
                        // block end. Tagging the emitted notes with it keeps arp timing tight
                        // instead of rounding every step to the block boundary.
                        const framesPastStep = a.beatsAccum * t.framesPerBeat;
                        const stepFrame = Math.max(
                            0,
                            Math.min(blockSize - 1, Math.round(blockSize - framesPastStep)),
                        );
                        // build ordered note list (with octaves) from held set
                        // held notes arrive via MIDI routing; maintain in a.held
                        if (a.held.size === 0) { // no notes held, turn off any currently sounding
                            if (a.activeOut.size) { const offs = []; for (const n of a.activeOut.values()) offs.push({ data: [0x80, n & 0x7f, 0] }); this._broadcastArpMIDI(nid, offs); a.activeOut.clear(); }
                            continue;
                        }
                        const baseNotes = Array.from(a.held.values()).sort((x, y) => x - y);
                        const expanded = baseNotes.slice();
                        const octs = Math.max(1, Math.min(4, a.octaves | 0));
                        if (octs > 1) {
                            for (let o = 1; o < octs; o++) {
                                for (const n of baseNotes) { const nn = n + 12 * o; if (nn <= 127) expanded.push(nn); }
                            }
                            expanded.sort((x, y) => x - y);
                        }
                        if (a.mode === 'random') {
                            const choice = expanded[Math.floor(Math.random() * expanded.length)];
                            if (choice != null) this._arpApplyOutputSet(nid, a, new Set([choice]), stepFrame);
                        } else if (a.mode === 'chord') {
                            this._arpApplyOutputSet(nid, a, new Set(expanded), stepFrame);
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
                                if (note != null) this._arpApplyOutputSet(nid, a, new Set([note]), stepFrame);
                            } else {
                                // linear (up or down already sorted)
                                let lastIdx = -1;
                                if (a.activeOut.size === 1) { const only = a.activeOut.values().next().value!; lastIdx = a.order.indexOf(only); }
                                let idx = lastIdx;
                                idx += 1;
                                if (idx >= a.order.length) idx = 0;
                                const note = a.order[idx];
                                if (note != null) this._arpApplyOutputSet(nid, a, new Set([note]), stepFrame);
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
                if (nodeData.type === "synth") {
                    // Stage the events against their sample offset within this block rather
                    // than applying them all at the block boundary. `_resolveEventFrame` was
                    // already being computed and then thrown away, which quantised every note
                    // to 128 samples (2.9 ms at 44.1 kHz) with a per-event error.
                    const events = queue.splice(0, queue.length);
                    let pending = this._pendingSynthEvents.get(nodeId);
                    if (!pending) {
                        pending = [];
                        this._pendingSynthEvents.set(nodeId, pending);
                    }
                    for (const ev of events) {
                        if (!ev || !Array.isArray(ev.data)) continue;
                        pending.push({
                            frame: this._resolveEventFrame(
                                ev.atFrame,
                                ev.atTimeMs,
                                blockStartTimeSec,
                                blockSize,
                            ),
                            data: ev.data,
                        });
                    }
                    pending.sort((a, b) => a.frame - b.frame);
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

            // A synth that is not wired to a speaker never renders, so its staged events would
            // otherwise pile up. Apply them anyway rather than dropping them: keeping the
            // note state coherent means a key held while you patch the synth in starts
            // sounding as soon as it is connected (faded in, so it still does not click).
            if (this._pendingSynthEvents.size) {
                for (const [nodeId, pending] of this._pendingSynthEvents.entries()) {
                    if (!pending.length) continue;
                    const synth = this._getSynthInstance(nodeId);
                    if (synth) {
                        for (const ev of pending) this._applySynthEvent(synth, ev.data);
                    }
                    pending.length = 0;
                }
            }

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

            this._collectFadedOutNodes();
            this._flushModPreview();
        } catch (err) {
            try {
                this.port.postMessage({ type: "error", message: String(err) });
            } catch { }
        } finally {
            // Always return this block's buffers to the pool, even after an error, or the
            // pool drains and every subsequent block allocates.
            this._endBlock();
        }

        return true;
    }

    _arpApplyOutputSet(nodeId: string, a: ArpEntry, newSet: Set<number>, atFrame?: number): void {
        // Determine off/on differences
        const offs = [];
        for (const n of a.activeOut.values()) if (!newSet.has(n)) offs.push({ data: [0x80, n & 0x7f, 0], atFrame });
        const ons = [];
        for (const n of newSet.values()) if (!a.activeOut.has(n)) ons.push({ data: [0x90, n & 0x7f, 100], atFrame });
        if (offs.length) this._broadcastArpMIDI(nodeId, offs);
        if (ons.length) this._broadcastArpMIDI(nodeId, ons);
        a.activeOut = newSet;
        if (ons.length === 1) { try { this.port.postMessage({ type: 'arpNote', nodeId, note: ons[0].data[1] }); } catch { } }
    }

    _broadcastArpMIDI(nodeId: string, events: MidiEvent[]): void {
        if (!Array.isArray(events)) return;
        this._fanOutMIDI(nodeId, events);
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

    /** Apply one MIDI message to a synth instance. */
    _applySynthEvent(synth: WasmSynthNode, data: number[]): void {
        const [status, d1, d2] = data;
        const cmd = status & 0xf0;
        try {
            switch (cmd) {
                case 0x90: // Note On (velocity 0 means Note Off)
                    if ((d2 & 0x7f) > 0) synth.note_on?.(d1 & 0x7f, d2 & 0x7f);
                    else synth.note_off?.(d1 & 0x7f);
                    break;
                case 0x80: // Note Off
                    synth.note_off?.(d1 & 0x7f);
                    break;
                case 0xb0: {
                    // Control Change
                    const controller = d1 & 0x7f;
                    if (controller === 64) {
                        synth.sustain_pedal?.((d2 & 0x7f) >= 64); // sustain pedal
                    } else if (controller === 123) {
                        // All Notes Off
                        if (typeof synth.all_notes_off === 'function') {
                            synth.all_notes_off();
                        } else {
                            for (let n = 0; n < 128; n++) synth.note_off?.(n);
                        }
                    }
                    break;
                }
                default:
                    break; // other messages are not handled yet
            }
        } catch { }
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
        this._fanOutMIDI(nodeId, outEvents);
    }

    /**
     * Propagate values between "Value" nodes (like Bool, Number, Text) that are connected.
     * Value nodes act as sources or pass-throughs. If A -> B, then B.value = A.value.
     * We run multiple passes to handle chains of connections (A -> B -> C).
     * 
     * We also notify the main thread via 'modPreview' so the UI can reflect these
     * real-time value changes (e.g. showing a checkbox toggle when its input changes).
     */
    _propagateValueNodes() {
        const plan = this._plan;
        if (!plan.valueEdges.length) return;

        // Nodes are visited in dependency order (see _buildValueNodeOrder), so a chain like
        // Bool → Add → Multiply → destination resolves in one pass. This used to be a
        // four-pass fixpoint that spread and re-inserted every node object on every pass,
        // every block — by far the largest allocator in the render callback.
        for (const nodeId of plan.valueNodeOrder) {
            const node = this._nodes.get(nodeId);
            if (!node) continue;

            // Pull each incoming value into the destination field, in place.
            for (const edge of plan.paramModsByTarget.get(nodeId) ?? EMPTY_PARAM_CONNECTIONS) {
                const srcNode = this._nodes.get(edge.from);
                if (!srcNode) continue;
                const raw = srcNode[this._sourceOutputKey(edge)];
                if (raw === undefined || raw === null) continue;
                if (node[edge.targetParam] !== raw) {
                    node[edge.targetParam] = raw;
                }
                this._queueModPreview(nodeId, edge.targetParam, raw);
            }

            if (typeof node.type === 'string' && node.type.startsWith('logic-')) {
                const computed = this._computeLogicNodeValue(node);
                if (node.value !== computed) node.value = computed;
            }
        }
    }

    /**
     * Which field of the source node carries the value for this connection. Generic output
     * handles (`param-out`, `output`) mean "the node's value"; anything else names a field.
     */
    _sourceOutputKey(edge: ParamConnection): string {
        const out = edge.fromOutput;
        return out && out !== 'param-out' && out !== 'output' ? out : 'value';
    }

    _computeLogicNodeValue(node: NodeData): NodeData[string] {
        const type = node.type;
        const a = Number(node.a ?? 0);
        const b = Number(node.b ?? 0);
        const input = Number(node.inValue ?? 0);
        const min = Number(node.min ?? 0);
        const max = Number(node.max ?? (type === 'logic-to-range' || type === 'logic-from-range' ? 1 : 0));

        switch (type) {
            case 'logic-add': return a + b;
            case 'logic-subtract': return a - b;
            case 'logic-multiply': return a * b;
            case 'logic-divide': return b === 0 ? 0 : a / b;
            case 'logic-compare': {
                const op = String(node.operation || '==');
                switch (op) {
                    case '==': return a === b;
                    case '!=': return a !== b;
                    case '>': return a > b;
                    case '<': return a < b;
                    case '>=': return a >= b;
                    case '<=': return a <= b;
                    default: return false;
                }
            }
            case 'logic-gate': {
                const op = String(node.operation || 'and').toLowerCase();
                const ba = !!node.a;
                const bb = !!node.b;
                switch (op) {
                    case 'and': return ba && bb;
                    case 'or': return ba || bb;
                    case 'xor': return ba !== bb;
                    case 'nand': return !(ba && bb);
                    case 'not': return !ba;
                    default: return false;
                }
            }
            case 'logic-condition': return node.condition ? node.trueValue : node.falseValue;
            case 'logic-to-range': return min + input * (max - min);
            case 'logic-from-range': {
                const denom = max - min;
                return denom === 0 ? 0 : (input - min) / denom;
            }
            default: return node.value;
        }
    }

    /**
     * Resolve a node's parameters with its incoming modulations applied.
     *
     * Returns `data` unchanged when nothing modulates the node. Otherwise it returns a
     * per-node object that is reused across blocks — the previous implementation built a
     * fresh accumulator plus a `{ ...data, ...mods }` spread for every modulated node on
     * every quantum.
     */
    _applyParamModulations(nodeId: string, data: NodeData): NodeData {
        const mods = this._plan.paramModsByTarget.get(nodeId);
        if (!mods || !mods.length) return data;

        // Reuse this node's patched object. Copying `data` in first keeps unmodulated
        // fields current and clears anything a removed connection used to write.
        let patched = this._moddedData.get(nodeId);
        if (!patched) {
            patched = { type: data.type };
            this._moddedData.set(nodeId, patched);
        }
        for (const key of Object.keys(patched)) {
            if (!(key in data)) delete patched[key];
        }
        Object.assign(patched, data);

        // Direct value sources override the stored parameter; LFOs are offsets added on top
        // of whatever the direct sources (or the base value) resolved to.
        const directParams = new Set<string>();
        for (const m of mods) {
            const srcNode = this._nodes.get(m.from);
            if (!srcNode || srcNode.type === 'lfo') continue;

            const raw = srcNode[this._sourceOutputKey(m)];
            if (typeof raw === 'boolean') {
                patched[m.targetParam] = raw;
                directParams.add(m.targetParam);
                continue;
            }
            const v = Number(raw);
            const value = isFinite(v) ? v : 0;
            if (directParams.has(m.targetParam)) {
                // Several direct sources on one handle sum together.
                patched[m.targetParam] = (Number(patched[m.targetParam]) || 0) + value;
            } else {
                patched[m.targetParam] = value;
                directParams.add(m.targetParam);
            }
        }

        for (const m of mods) {
            const srcNode = this._nodes.get(m.from);
            if (!srcNode || srcNode.type !== 'lfo') continue;
            const base = Number(patched[m.targetParam]);
            patched[m.targetParam] = (isFinite(base) ? base : 0) + (this._lfoValues.get(m.from) || 0);
        }

        for (const m of mods) {
            this._queueModPreview(nodeId, m.targetParam, patched[m.targetParam]);
        }
        return patched;
    }

    // -----------------------------------------------------------------------
    // Modulation preview (UI readouts)
    // -----------------------------------------------------------------------

    /**
     * Stage a value for the next batched preview message.
     *
     * These drive the live number readouts on disabled controls. They used to be posted
     * individually from inside the render loop — roughly 344 messages/sec per modulated
     * node, each of which the main thread turned into a CustomEvent and a React re-render.
     * Now they are coalesced into one message at MOD_PREVIEW_INTERVAL_SEC.
     */
    _queueModPreview(nodeId: string, param: string, value: unknown): void {
        if (typeof value !== 'number' && typeof value !== 'boolean') return;
        if (typeof value === 'number' && !isFinite(value)) return;

        let entry = this._previewPending.get(nodeId);
        if (!entry) {
            entry = {};
            this._previewPending.set(nodeId, entry);
        }
        if (entry[param] !== value) {
            entry[param] = value;
            this._previewDirty = true;
        }
    }

    _flushModPreview(): void {
        if (!this._previewDirty) return;
        const now = this._timebase.audioCurrentTimeSec;
        if (now - this._previewLastSentSec < MOD_PREVIEW_INTERVAL_SEC) return;
        this._previewLastSentSec = now;
        this._previewDirty = false;

        // One message for the whole graph. The payload is rebuilt here rather than reusing
        // the staging map because postMessage structured-clones it anyway.
        const payload: Record<string, Record<string, number | boolean>> = {};
        for (const [nodeId, values] of this._previewPending.entries()) {
            payload[nodeId] = { ...values };
        }
        try {
            this.port.postMessage({ type: 'modPreviewBatch', nodes: payload });
        } catch { }
    }

    // -----------------------------------------------------------------------
    // Audio rendering
    // -----------------------------------------------------------------------

    /**
     * Render a node's audio for this block, exactly once.
     *
     * Returns the cached stereo pair, or null if the node produces no audio. Caching is not
     * just an optimisation: oscillator and synth phase is stateful, so rendering a node
     * twice in one quantum advanced its phase twice and its pitch came out an octave high.
     * That is what used to happen to any node feeding two destinations.
     */
    _renderNode(nodeId: string, depth: number): boolean {
        const cached = this._renderedL.get(nodeId);
        if (cached) return true;

        const data = this._dataForRender(nodeId);
        if (!data || typeof data.type !== 'string') return false;

        // Depth guard: a feedback loop in the patch would otherwise recurse forever. The
        // render cache breaks most cycles on its own (the second visit hits the cache), but
        // a cycle whose first visit is still in flight needs this.
        if (depth > 64) return false;

        const type = data.type;
        if (type !== 'oscillator' && type !== 'synth' && type !== 'reverb') return false;

        const outL = this._acquireBlockBuffer();
        const outR = this._acquireBlockBuffer();
        // Publish before rendering so a cycle reaching this node again sees silence rather
        // than recursing.
        this._renderedL.set(nodeId, outL);
        this._renderedR.set(nodeId, outR);

        const modded = this._applyParamModulations(nodeId, data);
        switch (type) {
            case 'oscillator':
                this._renderOscillator(nodeId, modded, outL, outR);
                break;
            case 'synth':
                this._renderSynth(nodeId, modded, outL, outR);
                break;
            case 'reverb':
                this._renderReverb(nodeId, modded, outL, outR, depth);
                break;
        }

        // Apply the node's fade envelope. This is the single place where a node enters or
        // leaves the mix, so a patch change ramps over NODE_FADE_SEC instead of stepping.
        this._applyNodeFade(nodeId, outL, outR);
        return true;
    }

    /**
     * Ramp a node's output by its fade gain. Settled at unity is the common case and skips
     * the loop entirely.
     */
    _applyNodeFade(nodeId: string, outL: Float32Array, outR: Float32Array): void {
        const gain = this._nodeGains.get(nodeId);
        if (!gain) return;
        if (gain.isSettled) {
            const g = gain.current;
            if (g === 1) return;
            if (g === 0) {
                outL.fill(0);
                outR.fill(0);
                return;
            }
            for (let i = 0; i < outL.length; i++) {
                outL[i] *= g;
                outR[i] *= g;
            }
            return;
        }
        for (let i = 0; i < outL.length; i++) {
            const g = gain.tick();
            outL[i] *= g;
            outR[i] *= g;
        }
    }

    /** Sum every audio source feeding `nodeId` into the given buffers. */
    _sumAudioInputs(nodeId: string, destL: Float32Array, destR: Float32Array, depth: number): boolean {
        const sources = this._plan.audioInputs.get(nodeId);
        if (!sources || !sources.length) return false;
        let any = false;
        for (const sourceId of sources) {
            if (!this._renderNode(sourceId, depth + 1)) continue;
            const srcL = this._renderedL.get(sourceId);
            const srcR = this._renderedR.get(sourceId);
            if (!srcL || !srcR) continue;
            for (let i = 0; i < destL.length; i++) {
                destL[i] += srcL[i];
                destR[i] += srcR[i];
            }
            any = true;
        }
        return any;
    }

    _renderOscillator(nodeId: string, modded: NodeData, outL: Float32Array, outR: Float32Array): void {
        const osc = this._getOscInstance(nodeId);
        if (!osc) return;
        try {
            // The Rust node smooths frequency and amplitude internally, so these are
            // targets rather than immediate values.
            if (typeof modded.frequency === 'number') osc.frequency = modded.frequency;
            if (typeof modded.amplitude === 'number') osc.amplitude = modded.amplitude;
            osc.set_waveform(this._getWaveformIndex((modded.waveform as string) || 'sine'));

            osc.process(outL);
            outR.set(outL);
        } catch {
            /* ignore per-block errors */
        }
    }

    _renderSynth(nodeId: string, modded: NodeData, outL: Float32Array, outR: Float32Array): void {
        const synth = this._getSynthInstance(nodeId);
        if (!synth) return;
        try {
            synth.set_waveform?.(this._getWaveformIndex((modded.waveform as string) || 'sawtooth'));
            if (typeof modded.maxVoices === 'number') {
                synth.set_max_voices?.(Math.max(1, Math.min(32, modded.maxVoices | 0)));
            }
            if (
                typeof modded.attack === 'number' ||
                typeof modded.decay === 'number' ||
                typeof modded.sustain === 'number' ||
                typeof modded.release === 'number'
            ) {
                synth.set_adsr?.(
                    typeof modded.attack === 'number' ? modded.attack : 0.005,
                    typeof modded.decay === 'number' ? modded.decay : 0.12,
                    typeof modded.sustain === 'number' ? modded.sustain : 0.7,
                    typeof modded.release === 'number' ? modded.release : 0.12,
                );
            }
            if (typeof modded.glide === 'number') synth.set_glide?.(modded.glide);
            if (typeof modded.gain === 'number') synth.set_gain?.(modded.gain);

            // Render in segments split at each event's frame, so a note lands on the sample
            // it was scheduled for instead of at the next block boundary.
            const pending = this._pendingSynthEvents.get(nodeId);
            if (!pending || !pending.length) {
                synth.process(outL);
                outR.set(outL);
                return;
            }

            let cursor = 0;
            let index = 0;
            while (index < pending.length) {
                const frame = Math.max(cursor, Math.min(outL.length, pending[index].frame));
                if (frame > cursor) {
                    synth.process(outL.subarray(cursor, frame));
                    cursor = frame;
                }
                // Apply every event landing on this frame before rendering onward.
                while (index < pending.length && pending[index].frame <= cursor) {
                    this._applySynthEvent(synth, pending[index].data);
                    index++;
                }
            }
            if (cursor < outL.length) synth.process(outL.subarray(cursor));
            pending.length = 0;
            outR.set(outL);
        } catch {
            /* ignore per-block errors */
        }
    }

    _renderReverb(
        nodeId: string,
        modded: NodeData,
        outL: Float32Array,
        outR: Float32Array,
        depth: number,
    ): void {
        // Each recursion level takes its own input buffers from the pool. Sharing one
        // scratch buffer meant a reverb feeding another reverb had the inner call zero the
        // buffer the outer call was still accumulating into.
        const inL = this._acquireBuffer();
        const inR = this._acquireBuffer();
        try {
            const hasInput = this._sumAudioInputs(nodeId, inL, inR, depth);
            const rev = this._getReverbInstance(nodeId);
            if (!rev) return;

            // Keep processing with a silent input when disconnected, so an existing tail
            // decays through the delay line instead of freezing in place.
            if (typeof modded.feedback === 'number') rev.feedback = modded.feedback;
            if (typeof modded.wetMix === 'number') rev.wet_mix = modded.wetMix;
            if (!hasInput && !this._hasAudibleTail(nodeId)) return;

            rev.process(inL, outL);
            outR.set(outL);
        } catch {
            /* ignore per-block errors */
        } finally {
            this._releaseBuffer(inL);
            this._releaseBuffer(inR);
        }
    }

    /** Entry point: render each speaker's input tree and mix it into the output. */
    _processGraph(outL: Float32Array, outR: Float32Array): void {
        const speakers = this._plan.speakers;
        if (!speakers.length) return; // no sinks; output stays silent

        const N = outL.length;
        for (const speakerId of speakers) {
            const data = this._dataForRender(speakerId);
            if (!data) continue;
            // A deleted speaker keeps rendering at a falling gain so its whole subtree fades
            // rather than cutting off.
            const isRetiring = !this._nodes.has(speakerId);

            const sumL = this._acquireBuffer();
            const sumR = this._acquireBuffer();
            try {
                this._sumAudioInputs(speakerId, sumL, sumR, 0);

                const modded = this._applyParamModulations(speakerId, data);
                const volume = typeof modded.volume === 'number' ? modded.volume : 1;
                const target = isRetiring || modded.muted
                    ? 0
                    : Math.max(0, Math.min(1, volume));

                let gain = this._speakerGains.get(speakerId);
                if (!gain) {
                    // First sight of this speaker: start at its target rather than ramping
                    // up from silence, so loading a project does not fade in.
                    gain = new SmoothedGain(target, SPEAKER_GAIN_SMOOTHING_SEC);
                    this._speakerGains.set(speakerId, gain);
                }
                gain.setTarget(target);

                // Ramping per sample is what turns mute from a full-scale step into a
                // short fade, and a volume drag from a staircase into a slide.
                if (gain.isSettled) {
                    const g = gain.current;
                    if (g !== 0) {
                        for (let i = 0; i < N; i++) {
                            outL[i] += sumL[i] * g;
                            outR[i] += sumR[i] * g;
                        }
                    }
                } else {
                    for (let i = 0; i < N; i++) {
                        const g = gain.tick();
                        outL[i] += sumL[i] * g;
                        outR[i] += sumR[i] * g;
                    }
                }
            } finally {
                this._releaseBuffer(sumL);
                this._releaseBuffer(sumR);
            }
        }
    }

    // Broadcast MIDI events from a sequencer node to its downstream MIDI connections
    _broadcastSequencerMIDI(nodeId: string, events: MidiEvent[]): void {
        if (!Array.isArray(events)) return;
        this._fanOutMIDI(nodeId, events);
    }
}

// Correct registration name expected by AudioManager
registerProcessor("audio-engine-processor", EngineProcessor);
