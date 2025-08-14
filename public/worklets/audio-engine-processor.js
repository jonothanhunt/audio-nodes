// public/worklets/audio-engine-processor.js
// AudioWorkletProcessor that runs the WASM audio engine off the main thread.
// It mirrors the processing previously done in AudioManager ScriptProcessorNode.

/* global registerProcessor, AudioWorkletProcessor, sampleRate */

class EngineProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        this._ready = false;
        this._loading = false;
        this._wasm = null; // module namespace holding classes (OscillatorNode, ReverbNode, ...)

        this._nodes = new Map(); // nodeId -> data
        this._connections = []; // { from, to, fromOutput, toInput }
        this._paramCache = new Map(); // nodeId -> last param payload for quick lookup

        // Keep persistent WASM instances per node to maintain DSP state across blocks
        this._oscInstances = new Map(); // nodeId -> wasm.OscillatorNode
        this._reverbInstances = new Map(); // nodeId -> wasm.ReverbNode
        this._synthInstances = new Map(); // nodeId -> wasm.SynthNode (planned)
        this._transposeInstances = new Map(); // nodeId -> wasm.MidiTransposeNode

        this._midiQueues = new Map(); // nodeId -> Array of events for next blocks
        this._timebase = { perfNowMs: 0, audioCurrentTimeSec: 0 };
        // Reusable scratch buffers to avoid per-block allocations
        this._scratch = {
            temp: null,
            inL: null,
            inR: null,
            sumL: null,
            sumR: null,
            size: 0,
        };

        this.port.onmessage = (e) => this._handleMessage(e.data);

        // Ask main thread to bootstrap the WASM into the worklet
        this._initWasm();

        this._transposeNoteState = new Map(); // nodeId -> { active: Map<key, transposedNote>, lastSemitones: number }

        // --- Global transport (beat-only, no bar/time-signature) ---
        this._transport = {
            bpm: 120,
            frameCounter: 0,            // absolute frames
            framesPerBeat: (60 / 120) * sampleRate,
            nextBeatFrame: 0,           // frame index of upcoming beat boundary
            beatIndex: 0,               // absolute beat counter
            pendingBpm: null,           // bpm value waiting to apply
            pendingBpmBeat: null,       // beat index at which to apply pending BPM
            syncAllNextBeat: false,     // request to reset sequencers next beat
        };

    // --- Sequencer registry (global clock driven) ---
    // Map<nodeId, {
    //   rateMultiplier: number (0.25,0.5,1,2,4)
    //   isPlaying: boolean
    //   pendingStartBeat: number|null (quantized start at global beat index)
    //   pendingRate: number|null (apply at next beat)
    //   stepIndex: number
    //   beatsAccum: number (accumulated beats toward next step)
    //   activeNotes: Set<number> (MIDI notes currently on)
    //   _startedOnce: boolean (internal guard to avoid duplicate initial step event)
    // }>
    this._sequencers = new Map();
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

    async _bootstrapFromMain(glueCode, wasmBytes) {
        if (this._ready || this._loading) return;
        this._loading = true;
        try {
            let code = String(glueCode);
            code = code.replace(/^export\s+class\s+/gm, "class ");
            code = code.replace(
                /export\s*\{\s*initSync\s*\};?/gm,
                "globalThis.__wbg_initSync = initSync;"
            );
            code = code.replace(
                /export\s+default\s+__wbg_init\s*;?/gm,
                "globalThis.__wbg_init_default = __wbg_init;"
            );
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
            new Function(code)();
            if (typeof globalThis.__wbg_init_default !== "function") {
                throw new Error(
                    "WASM init function not found after transforming glue"
                );
            }
            await globalThis.__wbg_init_default(wasmBytes);
            this._wasm = {
                AudioEngine: globalThis.AudioEngine,
                OscillatorNode: globalThis.OscillatorNode,
                ReverbNode: globalThis.ReverbNode,
                SpeakerNode: globalThis.SpeakerNode,
                SynthNode: globalThis.SynthNode,
                MidiTransposeNode: globalThis.MidiTransposeNode,
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
            } catch {}
        } finally {
            this._loading = false;
        }
    }

    _handleMessage(msg) {
        if (!msg || typeof msg !== "object") return;
        const { type } = msg;
        switch (type) {
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
                    // Stop immediately (gated) but do not reset step index; spec: Play false gates output w/o reset
                    entry.isPlaying = false;
                    entry.pendingStartBeat = null;
                    // Send NoteOff for any active notes if we had generated some (future-proof)
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
            case "bootstrapWasm": {
                const { glue, wasm } = msg;
                this._bootstrapFromMain(glue, wasm);
                try {
                    this.port.postMessage({ type: "ackBootstrap" });
                } catch {}
                break;
            }
            case "updateNode": {
                const { nodeId, data } = msg;
                this._nodes.set(nodeId, data);
                try {
                    this._paramCache.set(nodeId, data);
                } catch {}
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
                    if (typeof data.rateMultiplier === "number" && [0.25,0.5,1,2,4].includes(data.rateMultiplier)) {
                        entry.rateMultiplier = data.rateMultiplier;
                    }
                    // If project saved with playing=true, quantize start to next beat unless already scheduled/playing
                    if (data.playing && !entry.isPlaying && entry.pendingStartBeat == null) {
                        entry.pendingStartBeat = this._transport.beatIndex + 1;
                    }
                }
                try {
                    this.port.postMessage({ type: "ackNode", nodeId });
                } catch {}
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
                    } catch {}
                    this._oscInstances.delete(nodeId);
                }
                const rev = this._reverbInstances.get(nodeId);
                if (rev) {
                    try {
                        rev.free?.();
                    } catch {}
                    this._reverbInstances.delete(nodeId);
                }
                const syn = this._synthInstances.get(nodeId);
                if (syn) {
                    try {
                        syn.free?.();
                    } catch {}
                    this._synthInstances.delete(nodeId);
                }
                const tr = this._transposeInstances.get(nodeId);
                if (tr) {
                    try {
                        tr.free?.();
                    } catch {}
                    this._transposeInstances.delete(nodeId);
                }
                this._transposeNoteState.delete(nodeId);
                try {
                    this.port.postMessage({ type: "ackRemove", nodeId });
                } catch {}
                break;
            }
            case "updateConnections": {
                const { connections } = msg;
                this._connections = Array.isArray(connections)
                    ? connections
                    : [];
                try {
                    this.port.postMessage({
                        type: "ackConnections",
                        count: this._connections.length,
                    });
                } catch {}
                break;
            }
            case "clear": {
                this._nodes.clear();
                this._connections = [];
                this._paramCache.clear?.();
                this._sequencers.clear();
                for (const inst of this._oscInstances.values()) {
                    try {
                        inst.free?.();
                    } catch {}
                }
                for (const inst of this._reverbInstances.values()) {
                    try {
                        inst.free?.();
                    } catch {}
                }
                for (const inst of this._synthInstances.values()) {
                    try {
                        inst.free?.();
                    } catch {}
                }
                for (const inst of this._transposeInstances.values()) {
                    try {
                        inst.free?.();
                    } catch {}
                }
                this._oscInstances.clear();
                this._reverbInstances.clear();
                this._synthInstances.clear();
                this._transposeInstances.clear();
                try {
                    this.port.postMessage({ type: "ackClear" });
                } catch {}
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
            default:
                break;
        }
    }

    // Convert atTimeMs to frame index within current block if provided
    _resolveEventFrame(atFrame, atTimeMs, blockStartTimeSec, blockSize) {
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

    process(inputs, outputs /*, parameters */) {
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
                try { this.port.postMessage({ type: "beat", beatIndex: t.beatIndex, bpm: t.bpm }); } catch {}
                t.beatIndex += 1;
                // Apply pending rate changes at beat boundary
                for (const [, entry] of this._sequencers.entries()) {
                    if (entry.pendingRate != null) { entry.rateMultiplier = entry.pendingRate; entry.pendingRate = null; }
                }
                // Global sync request
                if (t.syncAllNextBeat) {
                    try { this.port.postMessage({ type: "syncScheduled", beatIndex: t.beatIndex }); } catch {}
                    for (const [nid, entry] of this._sequencers.entries()) {
                        if (!entry.isPlaying) continue;
                        entry.stepIndex = 0;
                        entry.beatsAccum = 0;
                        entry._startedOnce = true;
                        try { this.port.postMessage({ type: "sequencerStep", nodeId: nid, stepIndex: 0 }); } catch {}
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
                // Emit initial step events
                for (const [nid, entry] of this._sequencers.entries()) {
                    if (entry.isPlaying && entry._startedOnce === false) {
                        entry._startedOnce = true;
                        try { this.port.postMessage({ type: "sequencerStep", nodeId: nid, stepIndex: 0 }); } catch {}
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
                    const nodeData = this._nodes.get(nid) || {};
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
                        try { this.port.postMessage({ type: "sequencerStep", nodeId: nid, stepIndex: entry.stepIndex }); } catch {}
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
                    this._processTransposeMIDI?.(
                        nodeId,
                        nodeData,
                        events,
                        blockStartTimeSec,
                        blockSize
                    );
                } else {
                    queue.length = 0; // drop
                }
            }

            // Propagate param values along param edges
            try {
                const paramEdges = this._connections.filter(
                    (c) =>
                        c &&
                        (c.fromOutput === "output" || c.fromOutput == null) &&
                        c.toInput &&
                        typeof c.toInput === "string" &&
                        this._nodes.get(c.from) &&
                        this._nodes.get(c.to)
                );
                for (const e of paramEdges) {
                    const src = this._nodes.get(e.from) || {};
                    const dst = this._nodes.get(e.to) || {};
                    // Determine value to forward: by convention use 'value' when present, else try fromOutput key
                    let v = undefined;
                    if (Object.prototype.hasOwnProperty.call(src, "value")) {
                        v = src.value;
                    } else if (
                        e.fromOutput &&
                        Object.prototype.hasOwnProperty.call(src, e.fromOutput)
                    ) {
                        v = src[e.fromOutput];
                    }
                    if (v !== undefined) {
                        // assign shallowly; avoid copying functions
                        try {
                            dst[e.toInput] = v;
                            this._nodes.set(e.to, dst);
                        } catch {}
                    }
                }
            } catch {}

            this._processGraph(outL, outR);

            // Advance coarse timebase by one block
            this._timebase.audioCurrentTimeSec += blockSize / sampleRate;
            t.frameCounter += blockSize;
        } catch (err) {
            try {
                this.port.postMessage({ type: "error", message: String(err) });
            } catch {}
        }

        return true;
    }

    _getWaveformIndex(w) {
        switch (w) {
            case "sine":
                return 0;
            case "square":
                return 1;
            case "sawtooth":
                return 2;
            case "triangle":
                return 3;
            default:
                return 0;
        }
    }

    _getOscInstance(nodeId) {
        let inst = this._oscInstances.get(nodeId);
        if (!inst) {
            inst = new this._wasm.OscillatorNode(sampleRate);
            this._oscInstances.set(nodeId, inst);
        }
        return inst;
    }

    _getReverbInstance(nodeId) {
        let inst = this._reverbInstances.get(nodeId);
        if (!inst) {
            inst = new this._wasm.ReverbNode(sampleRate);
            this._reverbInstances.set(nodeId, inst);
        }
        return inst;
    }

    _getSynthInstance(nodeId) {
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

    _getTransposeInstance(nodeId) {
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
    _processSynth(nodeId, data, outL, outR) {
        const N = outL.length;
        const synth = this._getSynthInstance(nodeId);
        if (!synth) return;
        try {
            const wf = this._getWaveformIndex(data.waveform || "sawtooth");
            synth.set_waveform?.(wf);
            if (typeof data.maxVoices === "number")
                synth.set_max_voices?.(
                    Math.max(1, Math.min(32, data.maxVoices | 0))
                );
            if (
                typeof data.attack === "number" ||
                typeof data.decay === "number" ||
                typeof data.sustain === "number" ||
                typeof data.release === "number"
            ) {
                const a = typeof data.attack === "number" ? data.attack : 0.005;
                const d = typeof data.decay === "number" ? data.decay : 0.12;
                const s = typeof data.sustain === "number" ? data.sustain : 0.7;
                const r =
                    typeof data.release === "number" ? data.release : 0.12;
                synth.set_adsr?.(a, d, s, r);
            }
            if (typeof data.glide === "number") synth.set_glide?.(data.glide);
            if (typeof data.gain === "number") synth.set_gain?.(data.gain);

            const temp = this._scratch.temp;
            synth.process(temp);
            for (let i = 0; i < N; i++) {
                const s = temp[i];
                outL[i] += s;
                outR[i] += s;
            }
        } catch {}
    }

    // Deliver MIDI events to a Synth instance (Note On/Off handling)
    _processSynthMIDI(nodeId, events, blockStartTimeSec, blockSize) {
        void blockStartTimeSec;
        void blockSize;
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
                            } catch {}
                        } else {
                            // Fallback: manually send note_off for all notes
                            for (let n = 0; n < 128; n++) {
                                try {
                                    synth.note_off?.(n);
                                } catch {}
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
        nodeId,
        data,
        events /*, blockStartTimeSec, blockSize */
    ) {
        const inst = this._getTransposeInstance(nodeId);
        if (!inst) return;
        const semitones =
            typeof data.semitones === "number" ? data.semitones : 0;
        const clampLow = typeof data.clampLow === "number" ? data.clampLow : 0;
        const clampHigh =
            typeof data.clampHigh === "number" ? data.clampHigh : 127;
        const passOther = !!data.passOther;
        try {
            inst.set_params?.(semitones, clampLow, clampHigh, passOther);
        } catch {}

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
                    } catch {}
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
                        } catch {}
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
                    } catch {}
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
                    } catch {}
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

    _processOscillator(nodeId, data, outL, outR) {
        const N = outL.length;
        const osc = this._getOscInstance(nodeId);
        try {
            if (typeof data.frequency === "number")
                osc.frequency = data.frequency;
            if (typeof data.amplitude === "number")
                osc.amplitude = data.amplitude;
            osc.set_waveform(this._getWaveformIndex(data.waveform || "sine"));

            const temp = this._scratch.temp;
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

    _processReverb(nodeId, data, outL, outR, visited) {
        // Only treat audio edges into main audio input
        const inputs = this._connections.filter(
            (c) =>
                c.to === nodeId &&
                c.toInput === "input" &&
                (c.fromOutput === "output" || !c.fromOutput)
        );
        if (inputs.length === 0) return;

        const N = outL.length;
        const inL = this._scratch.inL;
        const inR = this._scratch.inR;
        inL.fill(0);
        inR.fill(0);

        for (const c of inputs) {
            const src = this._nodes.get(c.from);
            if (!src) continue;
            this._processInputNode(c.from, src, inL, inR, visited);
        }

        const rev = this._getReverbInstance(nodeId);
        try {
            if (typeof data.feedback === "number") rev.feedback = data.feedback;
            if (typeof data.wetMix === "number") rev.wet_mix = data.wetMix;

            const temp = this._scratch.temp;
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
    _processInputNode(nodeId, data, outL, outR, visited = new Set()) {
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
    _processGraph(outL, outR) {
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
            const sumL = this._scratch.sumL;
            const sumR = this._scratch.sumR;
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
    _broadcastSequencerMIDI(nodeId, events) {
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
