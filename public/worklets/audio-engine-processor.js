const _global = globalThis;
const WAVEFORM_INDEX = {
  sine: 0,
  square: 1,
  sawtooth: 2,
  triangle: 3
};
const LFO_WAVEFORM_INDEX = {
  sine: 0,
  triangle: 1,
  saw: 2,
  square: 3
};
class EngineProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ready = false;
    this._loading = false;
    this._wasm = null;
    this._nodes = /* @__PURE__ */ new Map();
    this._connections = [];
    this._paramCache = /* @__PURE__ */ new Map();
    this._oscInstances = /* @__PURE__ */ new Map();
    this._reverbInstances = /* @__PURE__ */ new Map();
    this._synthInstances = /* @__PURE__ */ new Map();
    this._transposeInstances = /* @__PURE__ */ new Map();
    this._lfoInstances = /* @__PURE__ */ new Map();
    this._lfoValues = /* @__PURE__ */ new Map();
    this._paramConnections = [];
    this._midiQueues = /* @__PURE__ */ new Map();
    this._timebase = { perfNowMs: 0, audioCurrentTimeSec: 0 };
    this._scratch = {
      temp: null,
      inL: null,
      inR: null,
      sumL: null,
      sumR: null,
      size: 0
    };
    this.port.onmessage = (e) => this._handleMessage(e.data);
    this._initWasm();
    this._transposeNoteState = /* @__PURE__ */ new Map();
    this._transport = {
      bpm: 120,
      frameCounter: 0,
      framesPerBeat: 60 / 120 * sampleRate,
      nextBeatFrame: 0,
      beatIndex: 0,
      pendingBpm: null,
      pendingBpmBeat: null,
      syncAllNextBeat: false
    };
    this._captureActive = false;
    this._sequencers = /* @__PURE__ */ new Map();
    this._arps = /* @__PURE__ */ new Map();
  }
  async _initWasm() {
    if (this._loading || this._ready) return;
    this._loading = true;
    try {
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
          q.push({ data: [176 | ch, 123, 0] });
        }
        this._midiQueues.set(nid, q);
      }
    } catch {
    }
  }
  async _bootstrapFromMain(glueCode, wasmBytes) {
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
      code += '\ntry { globalThis.AudioEngine = typeof AudioEngine !== "undefined" ? AudioEngine : globalThis.AudioEngine; } catch(_){}';
      code += '\ntry { globalThis.OscillatorNode = typeof OscillatorNode !== "undefined" ? OscillatorNode : globalThis.OscillatorNode; } catch(_){}';
      code += '\ntry { globalThis.ReverbNode = typeof ReverbNode !== "undefined" ? ReverbNode : globalThis.ReverbNode; } catch(_){}';
      code += '\ntry { globalThis.SpeakerNode = typeof SpeakerNode !== "undefined" ? SpeakerNode : globalThis.SpeakerNode; } catch(_){}';
      code += '\ntry { globalThis.SynthNode = typeof SynthNode !== "undefined" ? SynthNode : globalThis.SynthNode; } catch(_){}';
      code += '\ntry { globalThis.MidiTransposeNode = typeof MidiTransposeNode !== "undefined" ? MidiTransposeNode : globalThis.MidiTransposeNode; } catch(_){}';
      code += '\ntry { globalThis.LfoNode = typeof LfoNode !== "undefined" ? LfoNode : globalThis.LfoNode; } catch(_){}';
      new Function(code)();
      if (typeof _global.__wbg_init_default !== "function") {
        throw new Error(
          "WASM init function not found after transforming glue"
        );
      }
      await _global.__wbg_init_default(wasmBytes);
      this._wasm = {
        AudioEngine: _global.AudioEngine,
        OscillatorNode: _global.OscillatorNode,
        ReverbNode: _global.ReverbNode,
        SpeakerNode: _global.SpeakerNode,
        SynthNode: _global.SynthNode,
        MidiTransposeNode: _global.MidiTransposeNode,
        LfoNode: _global.LfoNode
      };
      if (typeof this._wasm.SynthNode !== "function") {
        this.port.postMessage({
          type: "error",
          message: "SynthNode constructor missing in worklet (type=" + typeof this._wasm.SynthNode + ")"
        });
      }
      if (typeof this._wasm.MidiTransposeNode !== "function") {
        this.port.postMessage({
          type: "error",
          message: "MidiTransposeNode constructor missing in worklet"
        });
      }
      this._ready = true;
      this.port.postMessage({ type: "ready", sampleRate });
    } catch (err) {
      try {
        this.port.postMessage({ type: "error", message: String(err) });
      } catch {
      }
    } finally {
      this._loading = false;
    }
  }
  _handleMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    switch (msg.type) {
      case "setBpm": {
        const bpm = Number(msg.bpm);
        if (isFinite(bpm) && bpm >= 20 && bpm <= 300) {
          const t = this._transport;
          t.pendingBpm = bpm;
          t.pendingBpmBeat = t.beatIndex + 1;
        }
        break;
      }
      case "syncAllNextBeat": {
        this._transport.syncAllNextBeat = true;
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
            activeNotes: /* @__PURE__ */ new Set(),
            _startedOnce: false
          };
          this._sequencers.set(nodeId, entry);
        }
        entry.pendingRate = m;
        break;
      }
      case "setSequencerPlay": {
        const { nodeId, play } = msg;
        if (!nodeId) break;
        const isPlayingModulated = this._paramConnections && this._paramConnections.some((m) => m.to === nodeId && m.targetParam === "playing");
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
            activeNotes: /* @__PURE__ */ new Set(),
            _startedOnce: false
          };
          this._sequencers.set(nodeId, entry);
        }
        if (play) {
          if (!entry.isPlaying && entry.pendingStartBeat == null) {
            entry.pendingStartBeat = this._transport.beatIndex + 1;
          }
        } else {
          entry.isPlaying = false;
          entry.pendingStartBeat = null;
          if (entry.activeNotes.size) {
            const outEvents = [];
            for (const midi of entry.activeNotes.values()) {
              outEvents.push({ data: [128, midi & 127, 0] });
            }
            this._broadcastSequencerMIDI(nodeId, outEvents);
            entry.activeNotes.clear();
          }
        }
        break;
      }
      case "setArpRate": {
        const { nodeId, multiplier } = msg;
        if (!nodeId) break;
        const m = Number(multiplier);
        if (![0.25, 0.5, 1, 2, 4].includes(m)) break;
        let entry = this._arps.get(nodeId);
        if (!entry) {
          entry = { rateMultiplier: 1, isPlaying: false, pendingStartBeat: null, pendingRate: null, beatsAccum: 0, held: /* @__PURE__ */ new Set(), order: [], dir: 1, activeOut: /* @__PURE__ */ new Set(), mode: "up", octaves: 1 };
          this._arps.set(nodeId, entry);
        }
        entry.pendingRate = m;
        break;
      }
      case "setArpPlay": {
        const { nodeId, play } = msg;
        if (!nodeId) break;
        let entry = this._arps.get(nodeId);
        if (!entry) {
          entry = { rateMultiplier: 1, isPlaying: false, pendingStartBeat: null, pendingRate: null, beatsAccum: 0, held: /* @__PURE__ */ new Set(), order: [], dir: 1, activeOut: /* @__PURE__ */ new Set(), mode: "up", octaves: 1 };
          this._arps.set(nodeId, entry);
        }
        if (play) {
          if (!entry.isPlaying && entry.pendingStartBeat == null) entry.pendingStartBeat = this._transport.beatIndex + 1;
        } else {
          entry.isPlaying = false;
          entry.pendingStartBeat = null;
          entry.beatsAccum = 0;
          if (entry.activeOut.size) {
            const offEvents = [];
            for (const n of entry.activeOut.values()) offEvents.push({ data: [128, n & 127, 0] });
            this._broadcastArpMIDI(nodeId, offEvents);
            entry.activeOut.clear();
          }
        }
        break;
      }
      case "panic": {
        this._handlePanic();
        break;
      }
      case "bootstrapWasm": {
        const { glue, wasm } = msg;
        this._bootstrapFromMain(glue, wasm);
        try {
          this.port.postMessage({ type: "ackBootstrap" });
        } catch {
        }
        break;
      }
      case "updateNode": {
        const { nodeId, data } = msg;
        let outData;
        try {
          outData = { type: data.type };
          for (const [key, val] of Object.entries(data)) {
            outData[key] = val;
          }
        } catch {
          outData = data;
        }
        this._nodes.set(nodeId, outData);
        try {
          this._paramCache.set(nodeId, outData);
        } catch {
        }
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
              activeNotes: /* @__PURE__ */ new Set(),
              _startedOnce: false
            };
            this._sequencers.set(nodeId, entry);
          }
          if (typeof data.rateMultiplier === "number" && [0.25, 0.5, 1, 2, 4].includes(data.rateMultiplier)) {
            entry.rateMultiplier = data.rateMultiplier;
          }
          if (data.playing && !entry.isPlaying && entry.pendingStartBeat == null) {
            entry.pendingStartBeat = this._transport.beatIndex + 1;
          }
        }
        if (data && data.type === "arpeggiator") {
          let e = this._arps.get(nodeId);
          if (!e) {
            e = { rateMultiplier: 1, isPlaying: false, pendingStartBeat: null, pendingRate: null, beatsAccum: 0, held: /* @__PURE__ */ new Set(), order: [], dir: 1, activeOut: /* @__PURE__ */ new Set(), mode: "up", octaves: 1 };
            this._arps.set(nodeId, e);
          }
          const oldMode = e.mode;
          const oldOct = e.octaves;
          if (typeof data.rateMultiplier === "number" && [0.25, 0.5, 1, 2, 4].includes(data.rateMultiplier)) e.rateMultiplier = data.rateMultiplier;
          if (data.playing && !e.isPlaying && e.pendingStartBeat == null) e.pendingStartBeat = this._transport.beatIndex + 1;
          if (typeof data.mode === "string") e.mode = data.mode;
          if (typeof data.octaves === "number") e.octaves = Math.max(1, Math.min(4, data.octaves | 0));
          if (oldMode !== e.mode || oldOct !== e.octaves) {
            if (e.activeOut.size) {
              const offs = [];
              for (const n of e.activeOut.values()) offs.push({ data: [128, n & 127, 0] });
              this._broadcastArpMIDI(nodeId, offs);
              e.activeOut.clear();
            }
          }
        }
        try {
          this.port.postMessage({ type: "ackNode", nodeId });
        } catch {
        }
        break;
      }
      case "removeNode": {
        const { nodeId } = msg;
        const oldData = this._nodes.get(nodeId);
        if (this._sequencers.has(nodeId)) {
          this._sequencers.delete(nodeId);
        }
        if (oldData && oldData.type === "midi-transpose") {
          const state = this._transposeNoteState.get(nodeId);
          if (state && state.active && state.active.size > 0) {
            const outEvents = [];
            for (const [
              key,
              transposedNote
            ] of state.active.entries()) {
              const channel = key >> 7 & 15;
              outEvents.push({
                data: [
                  128 | channel,
                  transposedNote & 127,
                  0
                ]
              });
            }
            const downstream = this._connections.filter(
              (c) => c.from === nodeId && (c.fromOutput === "midi-out" || c.fromOutput === "midi" || c.fromOutput == null)
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
        if (oldData && (oldData.type === "sequencer" || oldData.type === "midi-input")) {
          this._queueAllNotesOffToAllSynths();
        }
        this._nodes.delete(nodeId);
        const osc = this._oscInstances.get(nodeId);
        if (osc) {
          try {
            osc.free?.();
          } catch {
          }
          this._oscInstances.delete(nodeId);
        }
        const rev = this._reverbInstances.get(nodeId);
        if (rev) {
          try {
            rev.free?.();
          } catch {
          }
          this._reverbInstances.delete(nodeId);
        }
        const syn = this._synthInstances.get(nodeId);
        if (syn) {
          try {
            syn.free?.();
          } catch {
          }
          this._synthInstances.delete(nodeId);
        }
        const tr = this._transposeInstances.get(nodeId);
        if (tr) {
          try {
            tr.free?.();
          } catch {
          }
          this._transposeInstances.delete(nodeId);
        }
        this._transposeNoteState.delete(nodeId);
        try {
          this.port.postMessage({ type: "ackRemove", nodeId });
        } catch {
        }
        break;
      }
      case "updateConnections": {
        const { connections } = msg;
        this._connections = Array.isArray(connections) ? connections : [];
        this._paramConnections = [];
        for (const c of this._connections) {
          if (c.toInput && !["input", "output", "midi", "midi-out", "audio-in", "audio-out"].includes(c.toInput)) {
            let tp = c.toInput;
            if (tp.startsWith("param-")) tp = tp.substring(6);
            this._paramConnections.push({ from: c.from, to: c.to, fromOutput: c.fromOutput, targetParam: tp });
          }
        }
        try {
          this.port.postMessage({
            type: "ackConnections",
            count: this._connections.length
          });
        } catch {
        }
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
          } catch {
          }
        }
        for (const inst of this._reverbInstances.values()) {
          try {
            inst.free?.();
          } catch {
          }
        }
        for (const inst of this._synthInstances.values()) {
          try {
            inst.free?.();
          } catch {
          }
        }
        for (const inst of this._transposeInstances.values()) {
          try {
            inst.free?.();
          } catch {
          }
        }
        this._oscInstances.clear();
        this._reverbInstances.clear();
        this._synthInstances.clear();
        this._transposeInstances.clear();
        try {
          this.port.postMessage({ type: "ackClear" });
        } catch {
        }
        break;
      }
      case "timebase": {
        const { perfNowMs, audioCurrentTimeSec } = msg;
        this._timebase = {
          perfNowMs: Number(perfNowMs) || 0,
          audioCurrentTimeSec: Number(audioCurrentTimeSec) || 0
        };
        break;
      }
      case "midi": {
        const { sourceId, events } = msg;
        const midiEdges = this._connections.filter(
          (c) => c.from === sourceId && (c.fromOutput === "midi" || c.fromOutput === "midi-out" || c.fromOutput == null)
        );
        for (const edge of midiEdges) {
          const q = this._midiQueues.get(edge.to) || [];
          if (Array.isArray(events)) {
            for (const ev of events) {
              if (!ev || !Array.isArray(ev.data)) continue;
              q.push({
                data: ev.data.slice(0, 3),
                atFrame: ev.atFrame,
                atTimeMs: ev.atTimeMs
              });
            }
          }
          this._midiQueues.set(edge.to, q);
        }
        break;
      }
      case "startCapture": {
        this._captureActive = true;
        break;
      }
      case "stopCapture": {
        this._captureActive = false;
        try {
          this.port.postMessage({ type: "captureStopped" });
        } catch {
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
      const workletPerfOffsetSec = this._timebase.audioCurrentTimeSec - this._timebase.perfNowMs / 1e3;
      const eventTimeSec = atTimeMs / 1e3 + workletPerfOffsetSec;
      const framesFromBlockStart = Math.floor(
        (eventTimeSec - blockStartTimeSec) * sampleRate
      );
      if (framesFromBlockStart < 0 || framesFromBlockStart >= blockSize)
        return 0;
      return framesFromBlockStart;
    }
    return 0;
  }
  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const outL = output[0];
    const outR = output[1] || output[0];
    outL.fill(0);
    outR.fill(0);
    if (!this._ready || !this._wasm) {
      return true;
    }
    try {
      const blockSize = outL.length;
      if (this._scratch.size !== blockSize) {
        this._scratch.temp = new Float32Array(blockSize);
        this._scratch.inL = new Float32Array(blockSize);
        this._scratch.inR = new Float32Array(blockSize);
        this._scratch.sumL = new Float32Array(blockSize);
        this._scratch.sumR = new Float32Array(blockSize);
        this._scratch.size = blockSize;
      }
      const blockStartTimeSec = this._timebase.audioCurrentTimeSec;
      this._lfoValues.clear();
      const lfoNodes = Array.from(this._nodes.entries()).filter(([_, d]) => d?.type === "lfo");
      for (const [nid, lfoNode] of lfoNodes) {
        const inst = this._getLfoInstance(nid);
        if (!inst) continue;
        const beats = Number(lfoNode.beatsPerCycle) || 1;
        const wf = LFO_WAVEFORM_INDEX[lfoNode.waveform] ?? 0;
        const phase = Number(lfoNode.phase) || 0;
        try {
          inst.set_params(beats, wf, phase);
        } catch {
        }
        const raw = inst.next_value(blockSize, this._transport.bpm);
        let depth = Number(lfoNode.depth);
        if (!isFinite(depth)) depth = 1;
        let offset = Number(lfoNode.offset);
        if (!isFinite(offset)) offset = 0;
        const bipolar = lfoNode.bipolar !== false;
        let v = raw;
        if (!bipolar) v = (v + 1) * 0.5;
        v = v * depth + offset;
        this._lfoValues.set(nid, v);
      }
      this._propagateValueNodes();
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
              for (const midi of entry.activeNotes.values()) outEvents.push({ data: [128, midi & 127, 0] });
              this._broadcastSequencerMIDI(nid, outEvents);
              entry.activeNotes.clear();
            }
          }
          if (typeof patched.rateMultiplier === "number") entry.pendingRate = patched.rateMultiplier;
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
              for (const n of entry.activeOut.values()) offEvents.push({ data: [128, n & 127, 0] });
              this._broadcastArpMIDI(nid, offEvents);
              entry.activeOut.clear();
            }
          }
          if (typeof patched.rateMultiplier === "number") entry.pendingRate = patched.rateMultiplier;
          if (typeof patched.mode === "string") entry.mode = patched.mode;
          if (typeof patched.octaves === "number") entry.octaves = Math.max(1, Math.min(4, Math.floor(patched.octaves)));
        }
      }
      const t = this._transport;
      const blockStartFrame = t.frameCounter;
      const blockEndFrame = blockStartFrame + blockSize;
      if (t.nextBeatFrame < blockStartFrame) t.nextBeatFrame = blockStartFrame;
      while (t.nextBeatFrame >= blockStartFrame && t.nextBeatFrame < blockEndFrame) {
        if (t.pendingBpm != null && t.pendingBpmBeat === t.beatIndex) {
          t.bpm = t.pendingBpm;
          t.framesPerBeat = 60 / t.bpm * sampleRate;
          t.pendingBpm = null;
          t.pendingBpmBeat = null;
        }
        try {
          this.port.postMessage({ type: "beat", beatIndex: t.beatIndex, bpm: t.bpm });
        } catch {
        }
        t.beatIndex += 1;
        for (const [, entry] of this._sequencers.entries()) {
          if (entry.pendingRate != null) {
            entry.rateMultiplier = entry.pendingRate;
            entry.pendingRate = null;
          }
        }
        for (const [, a] of this._arps.entries()) {
          if (a.pendingRate != null) {
            a.rateMultiplier = a.pendingRate;
            a.pendingRate = null;
          }
        }
        if (t.syncAllNextBeat) {
          try {
            this.port.postMessage({ type: "syncScheduled", beatIndex: t.beatIndex });
          } catch {
          }
          for (const [nid, entry] of this._sequencers.entries()) {
            if (!entry.isPlaying) continue;
            entry.stepIndex = 0;
            entry.beatsAccum = 0;
            entry._startedOnce = true;
            try {
              this.port.postMessage({ type: "sequencerStep", nodeId: nid, stepIndex: 0 });
            } catch {
            }
          }
          t.syncAllNextBeat = false;
        }
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
          if (a.pendingStartBeat === t.beatIndex - 1) {
            a.isPlaying = true;
            a.beatsAccum = 0;
            a.pendingStartBeat = null;
            if (a.activeOut.size) {
              const offs = [];
              for (const n of a.activeOut.values()) offs.push({ data: [128, n & 127, 0] });
              this._broadcastArpMIDI("" + Math.random(), offs);
              a.activeOut.clear();
            }
          }
        }
        for (const [nid, entry] of this._sequencers.entries()) {
          if (entry.isPlaying && entry._startedOnce === false) {
            entry._startedOnce = true;
            try {
              this.port.postMessage({ type: "sequencerStep", nodeId: nid, stepIndex: 0 });
            } catch {
            }
          }
        }
        t.nextBeatFrame += t.framesPerBeat;
        if (t.nextBeatFrame >= blockEndFrame) break;
      }
      const beatsAdvanced = blockSize / t.framesPerBeat;
      if (this._sequencers.size) {
        for (const [nid, entry] of this._sequencers.entries()) {
          if (!entry.isPlaying) continue;
          const rate = entry.rateMultiplier || 1;
          const stepDurationBeats = 1 / rate;
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
            try {
              this.port.postMessage({ type: "sequencerStep", nodeId: nid, stepIndex: entry.stepIndex });
            } catch {
            }
          }
        }
      }
      if (this._arps.size) {
        for (const [nid, a] of this._arps.entries()) {
          if (!a.isPlaying) continue;
          a.beatsAccum += beatsAdvanced;
          const stepBeats = 1 / (a.rateMultiplier || 1);
          if (a.beatsAccum >= stepBeats) {
            a.beatsAccum -= stepBeats;
            if (a.held.size === 0) {
              if (a.activeOut.size) {
                const offs = [];
                for (const n of a.activeOut.values()) offs.push({ data: [128, n & 127, 0] });
                this._broadcastArpMIDI(nid, offs);
                a.activeOut.clear();
              }
              continue;
            }
            const baseNotes = Array.from(a.held.values()).sort((x, y) => x - y);
            let expanded = baseNotes.slice();
            const octs = Math.max(1, Math.min(4, a.octaves | 0));
            if (octs > 1) {
              for (let o = 1; o < octs; o++) {
                for (const n of baseNotes) {
                  const nn = n + 12 * o;
                  if (nn <= 127) expanded.push(nn);
                }
              }
              expanded.sort((x, y) => x - y);
            }
            if (a.mode === "random") {
              const choice = expanded[Math.floor(Math.random() * expanded.length)];
              if (choice != null) this._arpApplyOutputSet(nid, a, /* @__PURE__ */ new Set([choice]));
            } else if (a.mode === "chord") {
              this._arpApplyOutputSet(nid, a, new Set(expanded));
            } else {
              if (!a.order.length) {
                a.order = expanded.slice();
                a.dir = 1;
              }
              a.order = a.order.filter((n) => expanded.includes(n));
              for (const n of expanded) if (!a.order.includes(n)) a.order.push(n);
              a.order.sort((x, y) => x - y);
              if (a.mode === "down") a.order.sort((x, y) => y - x);
              if (a.mode === "up-down") {
                let lastIdx = -1;
                if (a.activeOut.size === 1) {
                  const only = a.activeOut.values().next().value;
                  lastIdx = a.order.indexOf(only);
                }
                let idx = lastIdx;
                if (idx < 0) idx = a.dir === 1 ? -1 : a.order.length;
                idx += a.dir;
                if (idx >= a.order.length) {
                  a.dir = -1;
                  idx = a.order.length - 2;
                } else if (idx < 0) {
                  a.dir = 1;
                  idx = 1;
                }
                const note = a.order[Math.max(0, Math.min(a.order.length - 1, idx))];
                if (note != null) this._arpApplyOutputSet(nid, a, /* @__PURE__ */ new Set([note]));
              } else {
                let lastIdx = -1;
                if (a.activeOut.size === 1) {
                  const only = a.activeOut.values().next().value;
                  lastIdx = a.order.indexOf(only);
                }
                let idx = lastIdx;
                idx += 1;
                if (idx >= a.order.length) idx = 0;
                const note = a.order[idx];
                if (note != null) this._arpApplyOutputSet(nid, a, /* @__PURE__ */ new Set([note]));
              }
            }
          }
        }
      }
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
            events
          );
        } else if (nodeData.type === "arpeggiator") {
          const events = queue.splice(0, queue.length);
          let entry = this._arps.get(nodeId);
          if (!entry) {
            entry = { rateMultiplier: 1, isPlaying: false, pendingStartBeat: null, pendingRate: null, beatsAccum: 0, held: /* @__PURE__ */ new Set(), order: [], dir: 1, activeOut: /* @__PURE__ */ new Set(), mode: "up", octaves: 1 };
            this._arps.set(nodeId, entry);
          }
          for (const ev of events) {
            const [status, d1, d2] = ev.data;
            const cmd = status & 240;
            if (cmd === 144 && (d2 & 127) > 0) entry.held.add(d1 & 127);
            else if (cmd === 128 || cmd === 144 && (d2 & 127) === 0) entry.held.delete(d1 & 127);
          }
        } else {
          queue.length = 0;
        }
      }
      this._processGraph(outL, outR);
      if (this._captureActive) {
        const left = new Float32Array(outL);
        const right = new Float32Array(outR);
        try {
          this.port.postMessage({ type: "captureBlock", left, right }, [left.buffer, right.buffer]);
        } catch {
        }
      }
      this._timebase.audioCurrentTimeSec += blockSize / sampleRate;
      t.frameCounter += blockSize;
    } catch (err) {
      try {
        this.port.postMessage({ type: "error", message: String(err) });
      } catch {
      }
    }
    return true;
  }
  _arpApplyOutputSet(nodeId, a, newSet) {
    const offs = [];
    for (const n of a.activeOut.values()) if (!newSet.has(n)) offs.push({ data: [128, n & 127, 0] });
    const ons = [];
    for (const n of newSet.values()) if (!a.activeOut.has(n)) ons.push({ data: [144, n & 127, 100] });
    if (offs.length) this._broadcastArpMIDI(nodeId, offs);
    if (ons.length) this._broadcastArpMIDI(nodeId, ons);
    a.activeOut = newSet;
    if (ons.length === 1) {
      try {
        this.port.postMessage({ type: "arpNote", nodeId, note: ons[0].data[1] });
      } catch {
      }
    }
  }
  _broadcastArpMIDI(nodeId, events) {
    if (!Array.isArray(events) || !events.length) return;
    const downstream = this._connections.filter((c) => c.from === nodeId && (c.fromOutput === "midi-out" || c.fromOutput === "midi" || c.fromOutput == null));
    for (const edge of downstream) {
      const q = this._midiQueues.get(edge.to) || [];
      for (const ev of events) q.push(ev);
      this._midiQueues.set(edge.to, q);
    }
  }
  _handlePanic() {
    for (const [nid, entry] of this._sequencers.entries()) {
      if (entry.activeNotes && entry.activeNotes.size) {
        const offs = [];
        for (const n of entry.activeNotes.values()) offs.push({ data: [128, n & 127, 0] });
        this._broadcastSequencerMIDI(nid, offs);
        entry.activeNotes.clear();
      }
    }
    for (const [nid, a] of this._arps.entries()) {
      if (a.activeOut && a.activeOut.size) {
        const offs = [];
        for (const n of a.activeOut.values()) offs.push({ data: [128, n & 127, 0] });
        this._broadcastArpMIDI(nid, offs);
        a.activeOut.clear();
      }
    }
    this._queueAllNotesOffToAllSynths();
  }
  _getWaveformIndex(w) {
    return WAVEFORM_INDEX[w] ?? 0;
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
          message: "Cannot construct SynthNode; not a function"
        });
        return null;
      }
      inst = new Ctor(sampleRate);
      this._synthInstances.set(nodeId, inst);
    }
    return inst;
  }
  _getLfoInstance(nodeId) {
    let inst = this._lfoInstances.get(nodeId);
    if (!inst) {
      const Ctor = this._wasm && this._wasm.LfoNode;
      if (typeof Ctor !== "function") return null;
      try {
        inst = new Ctor(sampleRate);
      } catch {
        return null;
      }
      this._lfoInstances.set(nodeId, inst);
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
    const modded = this._applyParamModulations(nodeId, data);
    const N = outL.length;
    const synth = this._getSynthInstance(nodeId);
    if (!synth) return;
    try {
      const wf = this._getWaveformIndex(modded.waveform || "sawtooth");
      synth.set_waveform?.(wf);
      if (typeof modded.maxVoices === "number")
        synth.set_max_voices?.(
          Math.max(1, Math.min(32, modded.maxVoices | 0))
        );
      if (typeof modded.attack === "number" || typeof modded.decay === "number" || typeof modded.sustain === "number" || typeof modded.release === "number") {
        const a = typeof modded.attack === "number" ? modded.attack : 5e-3;
        const d = typeof modded.decay === "number" ? modded.decay : 0.12;
        const s = typeof modded.sustain === "number" ? modded.sustain : 0.7;
        const r = typeof modded.release === "number" ? modded.release : 0.12;
        synth.set_adsr?.(a, d, s, r);
      }
      if (typeof modded.glide === "number") synth.set_glide?.(modded.glide);
      if (typeof modded.gain === "number") synth.set_gain?.(modded.gain);
      const temp = this._scratch.temp;
      synth.process(temp);
      for (let i = 0; i < N; i++) {
        const s = temp[i];
        outL[i] += s;
        outR[i] += s;
      }
    } catch {
    }
  }
  // Deliver MIDI events to a Synth instance (Note On/Off handling)
  _processSynthMIDI(nodeId, events, _blockStartTimeSec, _blockSize) {
    const synth = this._synthInstances.get(nodeId) || this._getSynthInstance(nodeId);
    if (!synth) return;
    for (const ev of events) {
      const [status, d1, d2] = ev.data;
      const cmd = status & 240;
      switch (cmd) {
        case 144:
          if ((d2 & 127) > 0) {
            synth.note_on?.(d1 & 127, d2 & 127);
          } else {
            synth.note_off?.(d1 & 127);
          }
          break;
        case 128:
          synth.note_off?.(d1 & 127);
          break;
        case 176: {
          const controller = d1 & 127;
          if (controller === 64) {
            const down = (d2 & 127) >= 64;
            synth.sustain_pedal?.(down);
          } else if (controller === 123) {
            if (typeof synth.all_notes_off === "function") {
              try {
                synth.all_notes_off();
              } catch {
              }
            } else {
              for (let n = 0; n < 128; n++) {
                try {
                  synth.note_off?.(n);
                } catch {
                }
              }
            }
          }
          break;
        }
        default:
          break;
      }
    }
  }
  _processTransposeMIDI(nodeId, data, events) {
    const modded = this._applyParamModulations(nodeId, data);
    const inst = this._getTransposeInstance(nodeId);
    if (!inst) return;
    const semitones = typeof modded.semitones === "number" ? modded.semitones : 0;
    const clampLow = typeof modded.clampLow === "number" ? modded.clampLow : 0;
    const clampHigh = typeof modded.clampHigh === "number" ? modded.clampHigh : 127;
    const passOther = !!modded.passOther;
    try {
      inst.set_params?.(semitones, clampLow, clampHigh, passOther);
    } catch {
    }
    let state = this._transposeNoteState.get(nodeId);
    if (!state) {
      state = { active: /* @__PURE__ */ new Map(), lastSemitones: semitones };
      this._transposeNoteState.set(nodeId, state);
    }
    const outEvents = [];
    if (state.lastSemitones !== semitones) {
      for (const [key, transposedNote] of state.active.entries()) {
        const channel = key >> 7 & 15;
        outEvents.push({
          data: [128 | channel, transposedNote & 127, 0]
        });
      }
      state.active.clear();
      state.lastSemitones = semitones;
    }
    for (const ev of events) {
      const d = ev.data;
      if (!d || d.length < 3) continue;
      const status = d[0] & 255;
      const cmd = status & 240;
      const channel = status & 15;
      if (cmd === 144) {
        const origNote = d[1] & 127;
        const vel = d[2] & 127;
        if (vel > 0) {
          try {
            const res = inst.transform(status, origNote, vel);
            if (res && res.length === 3) {
              const transposedNote = res[1] & 127;
              const key = channel << 7 | origNote;
              state.active.set(key, transposedNote);
              outEvents.push({
                data: [
                  res[0] & 255,
                  transposedNote,
                  res[2] & 127
                ]
              });
            }
          } catch {
          }
        } else {
          const key = channel << 7 | origNote;
          const transposedNote = state.active.get(key);
          if (transposedNote != null) {
            outEvents.push({
              data: [128 | channel, transposedNote, 0]
            });
            state.active.delete(key);
          } else {
            try {
              const res = inst.transform(status, origNote, 0);
              if (res && res.length === 3)
                outEvents.push({
                  data: [128 | channel, res[1] & 127, 0]
                });
            } catch {
            }
          }
        }
      } else if (cmd === 128) {
        const origNote = d[1] & 127;
        const key = channel << 7 | origNote;
        const transposedNote = state.active.get(key);
        if (transposedNote != null) {
          outEvents.push({
            data: [128 | channel, transposedNote, 0]
          });
          state.active.delete(key);
        } else {
          try {
            const res = inst.transform(
              status,
              origNote,
              d[2] & 127
            );
            if (res && res.length === 3)
              outEvents.push({
                data: [128 | channel, res[1] & 127, 0]
              });
          } catch {
          }
        }
      } else {
        if (passOther) {
          try {
            const res = inst.transform(
              status,
              d[1] & 127,
              d[2] & 127
            );
            if (res && res.length === 3)
              outEvents.push({
                data: [
                  res[0] & 255,
                  res[1] & 127,
                  res[2] & 127
                ]
              });
          } catch {
          }
        }
      }
    }
    if (!outEvents.length) return;
    const downstream = this._connections.filter(
      (c) => c.from === nodeId && (c.fromOutput === "midi-out" || c.fromOutput === "midi" || c.fromOutput == null)
    );
    for (const edge of downstream) {
      const q = this._midiQueues.get(edge.to) || [];
      for (const ev of outEvents) q.push(ev);
      this._midiQueues.set(edge.to, q);
    }
  }
  _propagateValueNodes() {
    if (!this._paramConnections || !this._paramConnections.length) return;
    const valueTargets = this._paramConnections.filter((m) => {
      const n = this._nodes.get(m.to);
      return n && typeof n.type === "string" && n.type.startsWith("value-");
    });
    if (!valueTargets.length) return;
    if (!this._propagatedValues) this._propagatedValues = /* @__PURE__ */ new Map();
    for (let pass = 0; pass < 4; pass++) {
      let anyChanged = false;
      for (const m of valueTargets) {
        const srcNode = this._nodes.get(m.from);
        if (!srcNode) continue;
        const targetNode = this._nodes.get(m.to);
        if (!targetNode) continue;
        const outKey = m.fromOutput && m.fromOutput !== "param-out" && m.fromOutput !== "output" ? m.fromOutput : "value";
        const raw = srcNode[outKey];
        if (raw === void 0 || raw === null) continue;
        const prevNodeVal = targetNode[m.targetParam];
        if (prevNodeVal !== raw) {
          this._nodes.set(m.to, { ...targetNode, [m.targetParam]: raw });
          anyChanged = true;
        }
        const cacheKey = `${m.from}:${m.to}:${m.targetParam}`;
        if (this._propagatedValues.get(cacheKey) !== raw) {
          this._propagatedValues.set(cacheKey, raw);
          try {
            this.port.postMessage({ type: "modPreview", nodeId: m.to, data: { [m.targetParam]: raw } });
          } catch {
          }
        }
      }
      if (!anyChanged) break;
    }
  }
  _applyParamModulations(nodeId, data) {
    if (!this._paramConnections || !this._paramConnections.length) return data;
    const relevant = this._paramConnections.filter((m) => m.to === nodeId);
    if (!relevant.length) return data;
    const modAccum = {};
    const hasDirect = /* @__PURE__ */ new Set();
    const lfos = [];
    for (const m of relevant) {
      const srcNode = this._nodes.get(m.from);
      if (!srcNode) continue;
      if (srcNode.type === "lfo") {
        lfos.push(m);
      } else {
        const outKey = m.fromOutput && m.fromOutput !== "param-out" && m.fromOutput !== "output" ? m.fromOutput : "value";
        const raw = srcNode[outKey];
        if (typeof raw === "boolean") {
          modAccum[m.targetParam] = raw;
          hasDirect.add(m.targetParam);
        } else {
          const v = Number(raw);
          if (!hasDirect.has(m.targetParam)) {
            modAccum[m.targetParam] = isFinite(v) ? v : 0;
            hasDirect.add(m.targetParam);
          } else {
            modAccum[m.targetParam] += isFinite(v) ? v : 0;
          }
        }
      }
    }
    for (const m of lfos) {
      const v = this._lfoValues.get(m.from) || 0;
      if (modAccum[m.targetParam] === void 0) {
        modAccum[m.targetParam] = Number(data[m.targetParam]) || 0;
      }
      if (typeof modAccum[m.targetParam] === "number") {
        modAccum[m.targetParam] += v;
      }
    }
    if (Object.keys(modAccum).length) {
      const patched = { ...data, ...modAccum };
      try {
        this.port.postMessage({ type: "modPreview", nodeId, data: modAccum });
      } catch {
      }
      return patched;
    }
    return data;
  }
  _processOscillator(nodeId, data, outL, outR) {
    const modded = this._applyParamModulations(nodeId, data);
    const N = outL.length;
    const osc = this._getOscInstance(nodeId);
    try {
      if (typeof modded.frequency === "number")
        osc.frequency = modded.frequency;
      if (typeof modded.amplitude === "number")
        osc.amplitude = modded.amplitude;
      osc.set_waveform(this._getWaveformIndex(modded.waveform || "sine"));
      const temp = this._scratch.temp;
      osc.process(temp);
      for (let i = 0; i < N; i++) {
        const s = temp[i];
        outL[i] += s;
        outR[i] += s;
      }
    } catch {
    }
  }
  _processReverb(nodeId, data, outL, outR, visited) {
    const modded = this._applyParamModulations(nodeId, data);
    const inputs = this._connections.filter(
      (c) => c.to === nodeId && c.toInput === "input" && (c.fromOutput === "output" || !c.fromOutput)
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
      if (typeof modded.feedback === "number") rev.feedback = modded.feedback;
      if (typeof modded.wetMix === "number") rev.wet_mix = modded.wetMix;
      const temp = this._scratch.temp;
      rev.process(inL, temp);
      for (let i = 0; i < N; i++) {
        const s = temp[i];
        outL[i] += s;
        outR[i] += s;
      }
    } catch {
    }
  }
  // Recursively process an input node and mix into outL/outR
  _processInputNode(nodeId, data, outL, outR, visited = /* @__PURE__ */ new Set()) {
    if (!data || !data.type) return;
    if (visited.has(nodeId)) return;
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
      return;
    }
    const N = outL.length;
    for (const { nodeId, data } of speakers) {
      const sumL = this._scratch.sumL;
      const sumR = this._scratch.sumR;
      sumL.fill(0);
      sumR.fill(0);
      const inputs = this._connections.filter(
        (c) => c.to === nodeId && c.toInput === "input" && (c.fromOutput === "output" || !c.fromOutput)
      );
      for (const c of inputs) {
        const src = this._nodes.get(c.from);
        if (!src) continue;
        this._processInputNode(c.from, src, sumL, sumR, /* @__PURE__ */ new Set());
      }
      let gain = 1;
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
      (c) => c.from === nodeId && (c.fromOutput === "midi-out" || c.fromOutput === "midi" || c.fromOutput == null)
    );
    for (const edge of downstream) {
      const q = this._midiQueues.get(edge.to) || [];
      for (const ev of events) q.push(ev);
      this._midiQueues.set(edge.to, q);
    }
  }
}
registerProcessor("audio-engine-processor", EngineProcessor);
