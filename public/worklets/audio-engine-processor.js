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
const GAIN_SETTLE_EPSILON = 1e-4;
class SmoothedGain {
  constructor(initial, timeConstantSec) {
    this.current = initial;
    this.target = initial;
    const dt = 1 / sampleRate;
    this.coeff = timeConstantSec <= 0 ? 1 : dt / (timeConstantSec + dt);
  }
  setTarget(value) {
    if (Number.isFinite(value)) this.target = value;
  }
  /** Jump without ramping — only correct when there is no signal to discontinue. */
  snap(value) {
    if (Number.isFinite(value)) {
      this.current = value;
      this.target = value;
    }
  }
  get isSettled() {
    return this.current === this.target;
  }
  /** Converged on zero: the node is silent and safe to drop. */
  get isSilent() {
    return this.target === 0 && this.current === 0;
  }
  /**
   * Advance one sample.
   *
   * A one-pole approach never quite arrives, so the last stretch is snapped once the
   * remaining distance is inaudible (-80 dB). Without it a faded-out node would sit at a
   * small non-zero gain forever and never be retired.
   */
  tick() {
    const remaining = this.target - this.current;
    if (Math.abs(remaining) < GAIN_SETTLE_EPSILON) {
      this.current = this.target;
    } else {
      this.current += remaining * this.coeff;
    }
    return this.current;
  }
}
const NODE_FADE_SEC = 8e-3;
const SPEAKER_GAIN_SMOOTHING_SEC = 0.01;
const TEARDOWN_GRACE_BLOCKS = 512;
const TAIL_SILENCE_THRESHOLD = 1e-4;
const MOD_PREVIEW_INTERVAL_SEC = 1 / 30;
const EMPTY_STRINGS = [];
const EMPTY_PARAM_CONNECTIONS = [];
const NON_PARAM_HANDLES = /* @__PURE__ */ new Set([
  "input",
  "output",
  "midi",
  "midi-out",
  "audio-in",
  "audio-out"
]);
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
    this._plan = {
      speakers: [],
      audioInputs: /* @__PURE__ */ new Map(),
      reachable: /* @__PURE__ */ new Set(),
      lfoNodes: [],
      paramModsByTarget: /* @__PURE__ */ new Map(),
      midiDownstream: /* @__PURE__ */ new Map(),
      valueEdges: [],
      valueNodeOrder: []
    };
    this._planDirty = true;
    this._lastAudioInputs = /* @__PURE__ */ new Map();
    this._lastSpeakers = [];
    this._retiredNodeData = /* @__PURE__ */ new Map();
    this._bufferPool = [];
    this._bufferSize = 0;
    this._renderedL = /* @__PURE__ */ new Map();
    this._renderedR = /* @__PURE__ */ new Map();
    this._blockBuffers = [];
    this._nodeGains = /* @__PURE__ */ new Map();
    this._speakerGains = /* @__PURE__ */ new Map();
    this._fadingOut = /* @__PURE__ */ new Map();
    this._moddedData = /* @__PURE__ */ new Map();
    this._previewPending = /* @__PURE__ */ new Map();
    this._previewLastSentSec = 0;
    this._previewDirty = false;
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
  /** The pending MIDI queue for a node, created on first use. */
  _queueFor(nodeId) {
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
        q.push({ data: [176 | ch, 123, 0] });
      }
    }
  }
  /** Send events to every MIDI destination of `nodeId`, per the render plan. */
  _fanOutMIDI(nodeId, events) {
    if (!events.length) return;
    for (const targetId of this._plan.midiDownstream.get(nodeId) ?? EMPTY_STRINGS) {
      const q = this._queueFor(targetId);
      for (const ev of events) q.push(ev);
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
      code += '\ntry { globalThis.OscillatorNode = typeof OscillatorNode !== "undefined" ? OscillatorNode : globalThis.OscillatorNode; } catch(_){}';
      code += '\ntry { globalThis.ReverbNode = typeof ReverbNode !== "undefined" ? ReverbNode : globalThis.ReverbNode; } catch(_){}';
      code += '\ntry { globalThis.SynthNode = typeof SynthNode !== "undefined" ? SynthNode : globalThis.SynthNode; } catch(_){}';
      code += '\ntry { globalThis.MidiTransposeNode = typeof MidiTransposeNode !== "undefined" ? MidiTransposeNode : globalThis.MidiTransposeNode; } catch(_){}';
      code += '\ntry { globalThis.LfoNode = typeof LfoNode !== "undefined" ? LfoNode : globalThis.LfoNode; } catch(_){}';
      new Function(code)();
      if (typeof _global.__wbg_init_default !== "function") {
        throw new Error(
          "WASM init function not found after transforming glue"
        );
      }
      await _global.__wbg_init_default({
        module_or_path: wasmBytes
      });
      this._wasm = {
        OscillatorNode: _global.OscillatorNode,
        ReverbNode: _global.ReverbNode,
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
        this._planDirty = true;
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
        if (oldData && (oldData.type === "sequencer" || oldData.type === "midi-input")) {
          this._queueAllNotesOffToAllSynths();
        }
        const removed = this._nodes.get(nodeId);
        if (removed) this._retiredNodeData.set(nodeId, removed);
        this._nodes.delete(nodeId);
        this._paramCache.delete(nodeId);
        this._planDirty = true;
        break;
      }
      case "updateConnections": {
        const { connections } = msg;
        this._connections = Array.isArray(connections) ? connections : [];
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
        for (const inst of this._lfoInstances.values()) {
          try {
            inst.free?.();
          } catch {
          }
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
          audioCurrentTimeSec: Number(audioCurrentTimeSec) || 0
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
              atTimeMs: ev.atTimeMs
            });
          }
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
  _rebuildRenderPlan() {
    const plan = this._plan;
    plan.speakers.length = 0;
    plan.lfoNodes.length = 0;
    plan.valueEdges.length = 0;
    plan.valueNodeOrder.length = 0;
    plan.audioInputs.clear();
    plan.paramModsByTarget.clear();
    plan.midiDownstream.clear();
    plan.reachable.clear();
    const liveSpeakers = [];
    for (const [nodeId, data] of this._nodes.entries()) {
      if (!data || typeof data.type !== "string") continue;
      if (data.type === "speaker") liveSpeakers.push(nodeId);
      else if (data.type === "lfo") plan.lfoNodes.push(nodeId);
    }
    const liveAudioInputs = /* @__PURE__ */ new Map();
    for (const c of this._connections) {
      const isAudioEdge = c.toInput === "input" && (c.fromOutput === "output" || !c.fromOutput);
      if (isAudioEdge) {
        let list = liveAudioInputs.get(c.to);
        if (!list) {
          list = [];
          liveAudioInputs.set(c.to, list);
        }
        list.push(c.from);
        continue;
      }
      const isMidiEdge = c.fromOutput === "midi-out" || c.fromOutput === "midi" || c.fromOutput == null;
      if (isMidiEdge) {
        let list = plan.midiDownstream.get(c.from);
        if (!list) {
          list = [];
          plan.midiDownstream.set(c.from, list);
        }
        list.push(c.to);
      }
    }
    this._paramConnections.length = 0;
    for (const c of this._connections) {
      if (!c.toInput || NON_PARAM_HANDLES.has(c.toInput)) continue;
      const targetParam = c.toInput.startsWith("param-") ? c.toInput.substring(6) : c.toInput;
      const mod = {
        from: c.from,
        to: c.to,
        fromOutput: c.fromOutput,
        targetParam
      };
      this._paramConnections.push(mod);
      let list = plan.paramModsByTarget.get(c.to);
      if (!list) {
        list = [];
        plan.paramModsByTarget.set(c.to, list);
      }
      list.push(mod);
      const target = this._nodes.get(c.to);
      if (target && typeof target.type === "string" && (target.type.startsWith("value-") || target.type.startsWith("logic-"))) {
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
  _mergeRetiringTopology(plan, liveAudioInputs, liveSpeakers) {
    for (const [to, froms] of liveAudioInputs) plan.audioInputs.set(to, froms.slice());
    plan.speakers.push(...liveSpeakers);
    for (const [to, froms] of this._lastAudioInputs) {
      for (const from of froms) {
        if (liveAudioInputs.get(to)?.includes(from)) continue;
        const gain = this._nodeGains.get(from);
        if (!gain || gain.isSilent) continue;
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
    this._lastAudioInputs = new Map(plan.audioInputs);
    this._lastSpeakers = plan.speakers.slice();
  }
  /**
   * Order the value/logic nodes so a single evaluation pass resolves a whole chain
   * (Bool → Add → Multiply → destination). The old code brute-forced this with a
   * four-pass fixpoint every block; a topological order gets it right in one pass, and
   * cycles fall back to source order rather than spinning.
   */
  _buildValueNodeOrder(plan) {
    const dependencies = /* @__PURE__ */ new Map();
    for (const [nodeId, data] of this._nodes.entries()) {
      if (!data || typeof data.type !== "string") continue;
      if (!data.type.startsWith("value-") && !data.type.startsWith("logic-")) continue;
      dependencies.set(nodeId, []);
    }
    for (const edge of plan.valueEdges) {
      const deps = dependencies.get(edge.to);
      if (deps && dependencies.has(edge.from)) deps.push(edge.from);
    }
    const visiting = /* @__PURE__ */ new Set();
    const done = /* @__PURE__ */ new Set();
    const visit = (nodeId) => {
      if (done.has(nodeId) || visiting.has(nodeId)) return;
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
  _computeReachableAudioNodes(plan) {
    const walk = (nodeId) => {
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
  _dataForRender(nodeId) {
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
  _syncNodeFadeTargets(plan, liveAudioInputs, liveSpeakers) {
    const held = /* @__PURE__ */ new Set();
    const walk = (nodeId) => {
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
  _collectFadedOutNodes() {
    if (!this._fadingOut.size) return;
    for (const [nodeId, blocks] of this._fadingOut.entries()) {
      const gain = this._nodeGains.get(nodeId);
      if (gain && !gain.isSilent) continue;
      const elapsed = blocks + 1;
      this._fadingOut.set(nodeId, elapsed);
      const stillRinging = elapsed < TEARDOWN_GRACE_BLOCKS && this._hasAudibleTail(nodeId);
      if (stillRinging) continue;
      if (!this._nodes.has(nodeId)) {
        this._freeNodeInstances(nodeId);
        this._nodeGains.delete(nodeId);
        this._retiredNodeData.delete(nodeId);
      }
      this._fadingOut.delete(nodeId);
      this._planDirty = true;
    }
  }
  /** True while a node's internal state (reverb delay line, synth voices) still sounds. */
  _hasAudibleTail(nodeId) {
    const reverb = this._reverbInstances.get(nodeId);
    if (reverb && typeof reverb.tail_peak === "function") {
      try {
        if (reverb.tail_peak() > TAIL_SILENCE_THRESHOLD) return true;
      } catch {
      }
    }
    const synth = this._synthInstances.get(nodeId);
    if (synth && typeof synth.is_active === "function") {
      try {
        if (synth.is_active()) return true;
      } catch {
      }
    }
    return false;
  }
  _freeNodeInstances(nodeId) {
    for (const map of [
      this._oscInstances,
      this._reverbInstances,
      this._synthInstances,
      this._transposeInstances,
      this._lfoInstances
    ]) {
      const inst = map.get(nodeId);
      if (inst) {
        try {
          inst.free?.();
        } catch {
        }
        map.delete(nodeId);
      }
    }
    this._transposeNoteState.delete(nodeId);
    this._moddedData.delete(nodeId);
  }
  // -----------------------------------------------------------------------
  // Buffer pool
  // -----------------------------------------------------------------------
  _ensureBufferSize(blockSize) {
    if (this._bufferSize === blockSize) return;
    this._bufferSize = blockSize;
    this._bufferPool.length = 0;
    this._blockBuffers.length = 0;
  }
  _acquireBuffer() {
    const buf = this._bufferPool.pop();
    if (buf) {
      buf.fill(0);
      return buf;
    }
    return new Float32Array(this._bufferSize);
  }
  _releaseBuffer(buf) {
    this._bufferPool.push(buf);
  }
  /**
   * A buffer that lives for the rest of the block. Used by the render cache, and returned
   * to the pool wholesale in `_endBlock`.
   */
  _acquireBlockBuffer() {
    const buf = this._acquireBuffer();
    this._blockBuffers.push(buf);
    return buf;
  }
  _endBlock() {
    for (const buf of this._blockBuffers) this._releaseBuffer(buf);
    this._blockBuffers.length = 0;
    this._renderedL.clear();
    this._renderedR.clear();
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
      this._ensureBufferSize(blockSize);
      if (this._planDirty) this._rebuildRenderPlan();
      const blockStartTimeSec = this._timebase.audioCurrentTimeSec;
      this._lfoValues.clear();
      for (const nid of this._plan.lfoNodes) {
        const lfoNode = this._nodes.get(nid);
        if (!lfoNode) continue;
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
            const expanded = baseNotes.slice();
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
      this._collectFadedOutNodes();
      this._flushModPreview();
    } catch (err) {
      try {
        this.port.postMessage({ type: "error", message: String(err) });
      } catch {
      }
    } finally {
      this._endBlock();
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
    if (!Array.isArray(events)) return;
    this._fanOutMIDI(nodeId, events);
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
    for (const nodeId of plan.valueNodeOrder) {
      const node = this._nodes.get(nodeId);
      if (!node) continue;
      for (const edge of plan.paramModsByTarget.get(nodeId) ?? EMPTY_PARAM_CONNECTIONS) {
        const srcNode = this._nodes.get(edge.from);
        if (!srcNode) continue;
        const raw = srcNode[this._sourceOutputKey(edge)];
        if (raw === void 0 || raw === null) continue;
        if (node[edge.targetParam] !== raw) {
          node[edge.targetParam] = raw;
        }
        this._queueModPreview(nodeId, edge.targetParam, raw);
      }
      if (typeof node.type === "string" && node.type.startsWith("logic-")) {
        const computed = this._computeLogicNodeValue(node);
        if (node.value !== computed) node.value = computed;
      }
    }
  }
  /**
   * Which field of the source node carries the value for this connection. Generic output
   * handles (`param-out`, `output`) mean "the node's value"; anything else names a field.
   */
  _sourceOutputKey(edge) {
    const out = edge.fromOutput;
    return out && out !== "param-out" && out !== "output" ? out : "value";
  }
  _computeLogicNodeValue(node) {
    const type = node.type;
    const a = Number(node.a ?? 0);
    const b = Number(node.b ?? 0);
    const input = Number(node.inValue ?? 0);
    const min = Number(node.min ?? 0);
    const max = Number(node.max ?? (type === "logic-to-range" || type === "logic-from-range" ? 1 : 0));
    switch (type) {
      case "logic-add":
        return a + b;
      case "logic-subtract":
        return a - b;
      case "logic-multiply":
        return a * b;
      case "logic-divide":
        return b === 0 ? 0 : a / b;
      case "logic-compare": {
        const op = String(node.operation || "==");
        switch (op) {
          case "==":
            return a === b;
          case "!=":
            return a !== b;
          case ">":
            return a > b;
          case "<":
            return a < b;
          case ">=":
            return a >= b;
          case "<=":
            return a <= b;
          default:
            return false;
        }
      }
      case "logic-gate": {
        const op = String(node.operation || "and").toLowerCase();
        const ba = !!node.a;
        const bb = !!node.b;
        switch (op) {
          case "and":
            return ba && bb;
          case "or":
            return ba || bb;
          case "xor":
            return ba !== bb;
          case "nand":
            return !(ba && bb);
          case "not":
            return !ba;
          default:
            return false;
        }
      }
      case "logic-condition":
        return node.condition ? node.trueValue : node.falseValue;
      case "logic-to-range":
        return min + input * (max - min);
      case "logic-from-range": {
        const denom = max - min;
        return denom === 0 ? 0 : (input - min) / denom;
      }
      default:
        return node.value;
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
  _applyParamModulations(nodeId, data) {
    const mods = this._plan.paramModsByTarget.get(nodeId);
    if (!mods || !mods.length) return data;
    let patched = this._moddedData.get(nodeId);
    if (!patched) {
      patched = { type: data.type };
      this._moddedData.set(nodeId, patched);
    }
    for (const key of Object.keys(patched)) {
      if (!(key in data)) delete patched[key];
    }
    Object.assign(patched, data);
    const directParams = /* @__PURE__ */ new Set();
    for (const m of mods) {
      const srcNode = this._nodes.get(m.from);
      if (!srcNode || srcNode.type === "lfo") continue;
      const raw = srcNode[this._sourceOutputKey(m)];
      if (typeof raw === "boolean") {
        patched[m.targetParam] = raw;
        directParams.add(m.targetParam);
        continue;
      }
      const v = Number(raw);
      const value = isFinite(v) ? v : 0;
      if (directParams.has(m.targetParam)) {
        patched[m.targetParam] = (Number(patched[m.targetParam]) || 0) + value;
      } else {
        patched[m.targetParam] = value;
        directParams.add(m.targetParam);
      }
    }
    for (const m of mods) {
      const srcNode = this._nodes.get(m.from);
      if (!srcNode || srcNode.type !== "lfo") continue;
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
  _queueModPreview(nodeId, param, value) {
    if (typeof value !== "number" && typeof value !== "boolean") return;
    if (typeof value === "number" && !isFinite(value)) return;
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
  _flushModPreview() {
    if (!this._previewDirty) return;
    const now = this._timebase.audioCurrentTimeSec;
    if (now - this._previewLastSentSec < MOD_PREVIEW_INTERVAL_SEC) return;
    this._previewLastSentSec = now;
    this._previewDirty = false;
    const payload = {};
    for (const [nodeId, values] of this._previewPending.entries()) {
      payload[nodeId] = { ...values };
    }
    try {
      this.port.postMessage({ type: "modPreviewBatch", nodes: payload });
    } catch {
    }
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
  _renderNode(nodeId, depth) {
    const cached = this._renderedL.get(nodeId);
    if (cached) return true;
    const data = this._dataForRender(nodeId);
    if (!data || typeof data.type !== "string") return false;
    if (depth > 64) return false;
    const type = data.type;
    if (type !== "oscillator" && type !== "synth" && type !== "reverb") return false;
    const outL = this._acquireBlockBuffer();
    const outR = this._acquireBlockBuffer();
    this._renderedL.set(nodeId, outL);
    this._renderedR.set(nodeId, outR);
    const modded = this._applyParamModulations(nodeId, data);
    switch (type) {
      case "oscillator":
        this._renderOscillator(nodeId, modded, outL, outR);
        break;
      case "synth":
        this._renderSynth(nodeId, modded, outL, outR);
        break;
      case "reverb":
        this._renderReverb(nodeId, modded, outL, outR, depth);
        break;
    }
    this._applyNodeFade(nodeId, outL, outR);
    return true;
  }
  /**
   * Ramp a node's output by its fade gain. Settled at unity is the common case and skips
   * the loop entirely.
   */
  _applyNodeFade(nodeId, outL, outR) {
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
  _sumAudioInputs(nodeId, destL, destR, depth) {
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
  _renderOscillator(nodeId, modded, outL, outR) {
    const osc = this._getOscInstance(nodeId);
    if (!osc) return;
    try {
      if (typeof modded.frequency === "number") osc.frequency = modded.frequency;
      if (typeof modded.amplitude === "number") osc.amplitude = modded.amplitude;
      osc.set_waveform(this._getWaveformIndex(modded.waveform || "sine"));
      osc.process(outL);
      outR.set(outL);
    } catch {
    }
  }
  _renderSynth(nodeId, modded, outL, outR) {
    const synth = this._getSynthInstance(nodeId);
    if (!synth) return;
    try {
      synth.set_waveform?.(this._getWaveformIndex(modded.waveform || "sawtooth"));
      if (typeof modded.maxVoices === "number") {
        synth.set_max_voices?.(Math.max(1, Math.min(32, modded.maxVoices | 0)));
      }
      if (typeof modded.attack === "number" || typeof modded.decay === "number" || typeof modded.sustain === "number" || typeof modded.release === "number") {
        synth.set_adsr?.(
          typeof modded.attack === "number" ? modded.attack : 5e-3,
          typeof modded.decay === "number" ? modded.decay : 0.12,
          typeof modded.sustain === "number" ? modded.sustain : 0.7,
          typeof modded.release === "number" ? modded.release : 0.12
        );
      }
      if (typeof modded.glide === "number") synth.set_glide?.(modded.glide);
      if (typeof modded.gain === "number") synth.set_gain?.(modded.gain);
      synth.process(outL);
      outR.set(outL);
    } catch {
    }
  }
  _renderReverb(nodeId, modded, outL, outR, depth) {
    const inL = this._acquireBuffer();
    const inR = this._acquireBuffer();
    try {
      const hasInput = this._sumAudioInputs(nodeId, inL, inR, depth);
      const rev = this._getReverbInstance(nodeId);
      if (!rev) return;
      if (typeof modded.feedback === "number") rev.feedback = modded.feedback;
      if (typeof modded.wetMix === "number") rev.wet_mix = modded.wetMix;
      if (!hasInput && !this._hasAudibleTail(nodeId)) return;
      rev.process(inL, outL);
      outR.set(outL);
    } catch {
    } finally {
      this._releaseBuffer(inL);
      this._releaseBuffer(inR);
    }
  }
  /** Entry point: render each speaker's input tree and mix it into the output. */
  _processGraph(outL, outR) {
    const speakers = this._plan.speakers;
    if (!speakers.length) return;
    const N = outL.length;
    for (const speakerId of speakers) {
      const data = this._dataForRender(speakerId);
      if (!data) continue;
      const isRetiring = !this._nodes.has(speakerId);
      const sumL = this._acquireBuffer();
      const sumR = this._acquireBuffer();
      try {
        this._sumAudioInputs(speakerId, sumL, sumR, 0);
        const modded = this._applyParamModulations(speakerId, data);
        const volume = typeof modded.volume === "number" ? modded.volume : 1;
        const target = isRetiring || modded.muted ? 0 : Math.max(0, Math.min(1, volume));
        let gain = this._speakerGains.get(speakerId);
        if (!gain) {
          gain = new SmoothedGain(target, SPEAKER_GAIN_SMOOTHING_SEC);
          this._speakerGains.set(speakerId, gain);
        }
        gain.setTarget(target);
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
  _broadcastSequencerMIDI(nodeId, events) {
    if (!Array.isArray(events)) return;
    this._fanOutMIDI(nodeId, events);
  }
}
registerProcessor("audio-engine-processor", EngineProcessor);
