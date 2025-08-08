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

    // Keep persistent WASM instances per node to maintain DSP state across blocks
    this._oscInstances = new Map(); // nodeId -> wasm.OscillatorNode
    this._reverbInstances = new Map(); // nodeId -> wasm.ReverbNode
    this._synthInstances = new Map(); // nodeId -> wasm.SynthNode (planned)

    this._midiQueues = new Map(); // nodeId -> Array of events for next blocks
    this._timebase = { perfNowMs: 0, audioCurrentTimeSec: 0 };

    this.port.onmessage = (e) => this._handleMessage(e.data);

    // Ask main thread to bootstrap the WASM into the worklet
    this._initWasm();
  }

  async _initWasm() {
    if (this._loading || this._ready) return;
    this._loading = true;
    try {
      // Signal main thread to provide glue and wasm bytes
      this.port.postMessage({ type: 'needBootstrap' });
    } finally {
      this._loading = false;
    }
  }

  async _bootstrapFromMain(glueCode, wasmBytes) {
    if (this._ready || this._loading) return;
    this._loading = true;
    try {
      let code = String(glueCode);
      code = code.replace(/^export\s+class\s+/gm, 'class ');
      code = code.replace(/export\s*\{\s*initSync\s*\};?/gm, 'globalThis.__wbg_initSync = initSync;');
      code = code.replace(/export\s+default\s+__wbg_init\s*;?/gm, 'globalThis.__wbg_init_default = __wbg_init;');
      code = code.replace(/import\.meta\.url/g, "'/audio-engine-wasm/'");
      // Explicitly expose classes to globalThis
      code += '\ntry { globalThis.AudioEngine = typeof AudioEngine !== "undefined" ? AudioEngine : globalThis.AudioEngine; } catch(_){}';
      code += '\ntry { globalThis.OscillatorNode = typeof OscillatorNode !== "undefined" ? OscillatorNode : globalThis.OscillatorNode; } catch(_){}';
      code += '\ntry { globalThis.ReverbNode = typeof ReverbNode !== "undefined" ? ReverbNode : globalThis.ReverbNode; } catch(_){}';
      code += '\ntry { globalThis.SpeakerNode = typeof SpeakerNode !== "undefined" ? SpeakerNode : globalThis.SpeakerNode; } catch(_){}';
      code += '\ntry { globalThis.SynthNode = typeof SynthNode !== "undefined" ? SynthNode : globalThis.SynthNode; } catch(_){}';
      new Function(code)();
      if (typeof globalThis.__wbg_init_default !== 'function') {
        throw new Error('WASM init function not found after transforming glue');
      }
      await globalThis.__wbg_init_default(wasmBytes);
      this._wasm = {
        AudioEngine: globalThis.AudioEngine,
        OscillatorNode: globalThis.OscillatorNode,
        ReverbNode: globalThis.ReverbNode,
        SpeakerNode: globalThis.SpeakerNode,
        SynthNode: globalThis.SynthNode,
      };
      if (typeof this._wasm.SynthNode !== 'function') {
        this.port.postMessage({ type: 'error', message: 'SynthNode constructor missing in worklet (type=' + typeof this._wasm.SynthNode + ')' });
      }
      this._ready = true;
      this.port.postMessage({ type: 'ready', sampleRate });
    } catch (err) {
      try { this.port.postMessage({ type: 'error', message: String(err) }); } catch {}
    } finally {
      this._loading = false;
    }
  }

  _handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    const { type } = msg;
    switch (type) {
      case 'bootstrapWasm': {
        const { glue, wasm } = msg;
        this._bootstrapFromMain(glue, wasm);
        try { this.port.postMessage({ type: 'ackBootstrap' }); } catch {}
        break;
      }
      case 'updateNode': {
        const { nodeId, data } = msg;
        this._nodes.set(nodeId, data);
        try { this.port.postMessage({ type: 'ackNode', nodeId }); } catch {}
        break;
      }
      case 'removeNode': {
        const { nodeId } = msg;
        this._nodes.delete(nodeId);
        const osc = this._oscInstances.get(nodeId);
        if (osc) {
          try { osc.free?.(); } catch {}
          this._oscInstances.delete(nodeId);
        }
        const rev = this._reverbInstances.get(nodeId);
        if (rev) {
          try { rev.free?.(); } catch {}
          this._reverbInstances.delete(nodeId);
        }
        const syn = this._synthInstances.get(nodeId);
        if (syn) {
          try { syn.free?.(); } catch {}
          this._synthInstances.delete(nodeId);
        }
        try { this.port.postMessage({ type: 'ackRemove', nodeId }); } catch {}
        break;
      }
      case 'updateConnections': {
        const { connections } = msg;
        this._connections = Array.isArray(connections) ? connections : [];
        try { this.port.postMessage({ type: 'ackConnections', count: this._connections.length }); } catch {}
        break;
      }
      case 'clear': {
        this._nodes.clear();
        this._connections = [];
        for (const inst of this._oscInstances.values()) {
          try { inst.free?.(); } catch {}
        }
        for (const inst of this._reverbInstances.values()) {
          try { inst.free?.(); } catch {}
        }
        for (const inst of this._synthInstances.values()) {
          try { inst.free?.(); } catch {}
        }
        this._oscInstances.clear();
        this._reverbInstances.clear();
        this._synthInstances.clear();
        try { this.port.postMessage({ type: 'ackClear' }); } catch {}
        break;
      }
      case 'timebase': {
        const { perfNowMs, audioCurrentTimeSec } = msg;
        this._timebase = { perfNowMs: Number(perfNowMs) || 0, audioCurrentTimeSec: Number(audioCurrentTimeSec) || 0 };
        break;
      }
      case 'midi': {
        const { sourceId, events } = msg;
        const midiEdges = this._connections.filter((c) => c.from === sourceId && (c.fromOutput === 'midi' || c.fromOutput === undefined || c.fromOutput === null));
        for (const edge of midiEdges) {
          const q = this._midiQueues.get(edge.to) || [];
          if (Array.isArray(events)) {
            for (const ev of events) {
              if (!ev || !Array.isArray(ev.data)) continue;
              q.push({ data: ev.data.slice(0, 3), atFrame: ev.atFrame, atTimeMs: ev.atTimeMs });
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
    if (typeof atFrame === 'number' && isFinite(atFrame)) {
      return Math.max(0, Math.min(blockSize - 1, Math.floor(atFrame)));
    }
    if (typeof atTimeMs === 'number' && isFinite(atTimeMs)) {
      const workletPerfOffsetSec = this._timebase.audioCurrentTimeSec - (this._timebase.perfNowMs / 1000);
      const eventTimeSec = (atTimeMs / 1000) + workletPerfOffsetSec;
      const framesFromBlockStart = Math.floor((eventTimeSec - blockStartTimeSec) * sampleRate);
      if (framesFromBlockStart < 0 || framesFromBlockStart >= blockSize) return 0;
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
      // Approximate current audio time for this block
      const blockStartTimeSec = this._timebase.audioCurrentTimeSec; // updated when host sends timebase; coarse but fine for scheduling

      // Drain and dispatch MIDI to nodes before audio rendering
      for (const [nodeId, queue] of this._midiQueues.entries()) {
        if (!queue || queue.length === 0) continue;
        const nodeData = this._nodes.get(nodeId);
        if (!nodeData) continue;
        // Only synth will consume for now; others can ignore
        if (nodeData.type === 'synth' && this._processSynthMIDI) {
          const events = queue.splice(0, queue.length);
          this._processSynthMIDI(nodeId, events, blockStartTimeSec, blockSize);
        } else {
          // Unknown target, drop
          queue.length = 0;
        }
      }

      this._processGraph(outL, outR);

      // Advance coarse timebase by one block
      this._timebase.audioCurrentTimeSec += blockSize / sampleRate;
    } catch (err) {
      try { this.port.postMessage({ type: 'error', message: String(err) }); } catch {}
    }

    return true;
  }

  _getWaveformIndex(w) {
    switch (w) {
      case 'sine': return 0;
      case 'square': return 1;
      case 'sawtooth': return 2;
      case 'triangle': return 3;
      default: return 0;
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
      if (typeof Ctor !== 'function') {
        this.port.postMessage({ type: 'error', message: 'Cannot construct SynthNode; not a function' });
        return null;
      }
      inst = new Ctor(sampleRate);
      this._synthInstances.set(nodeId, inst);
    }
    return inst;
  }

  // Render Synth node audio into the provided output buffers
  _processSynth(nodeId, data, outL, outR) {
    const N = outL.length;
    const synth = this._getSynthInstance(nodeId);
    if (!synth) return;
    try {
      const wf = this._getWaveformIndex(data.waveform || 'sawtooth');
      synth.set_waveform?.(wf);
      if (
        typeof data.attack === 'number' ||
        typeof data.decay === 'number' ||
        typeof data.sustain === 'number' ||
        typeof data.release === 'number'
      ) {
        const a = typeof data.attack === 'number' ? data.attack : 0.005;
        const d = typeof data.decay === 'number' ? data.decay : 0.12;
        const s = typeof data.sustain === 'number' ? data.sustain : 0.7;
        const r = typeof data.release === 'number' ? data.release : 0.12;
        synth.set_adsr?.(a, d, s, r);
      }
      if (typeof data.glide === 'number') synth.set_glide?.(data.glide);
      if (typeof data.gain === 'number') synth.set_gain?.(data.gain);

      const temp = new Float32Array(N);
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
    void blockStartTimeSec; void blockSize;
    const synth = this._synthInstances.get(nodeId) || this._getSynthInstance(nodeId);
    if (!synth) return;
    for (const ev of events) {
      const [status, d1, d2] = ev.data;
      const cmd = status & 0xF0;
      switch (cmd) {
        case 0x90:
          if ((d2 & 0x7F) > 0) {
            synth.note_on?.(d1 & 0x7F, d2 & 0x7F);
          } else {
            synth.note_off?.(d1 & 0x7F);
          }
          break;
        case 0x80:
          synth.note_off?.(d1 & 0x7F);
          break;
        default:
          // ignore other messages for now
          break;
      }
    }
  }

  _processOscillator(nodeId, data, outL, outR) {
    const N = outL.length;
    const osc = this._getOscInstance(nodeId);
    try {
      if (typeof data.frequency === 'number') osc.frequency = data.frequency;
      if (typeof data.amplitude === 'number') osc.amplitude = data.amplitude;
      osc.set_waveform(this._getWaveformIndex(data.waveform || 'sine'));

      const temp = new Float32Array(N);
      osc.process(temp);
      for (let i = 0; i < N; i++) {
        const s = temp[i];
        outL[i] += s;
        outR[i] += s;
      }
    } catch { /* ignore per-block errors */ }
  }

  _processReverb(nodeId, data, outL, outR, visited) {
    // Only treat audio edges into main audio input
    const inputs = this._connections.filter(
      (c) => c.to === nodeId && c.toInput === 'input' && (c.fromOutput === 'output' || !c.fromOutput)
    );
    if (inputs.length === 0) return;

    const N = outL.length;
    const inL = new Float32Array(N);
    const inR = new Float32Array(N);

    for (const c of inputs) {
      const src = this._nodes.get(c.from);
      if (!src) continue;
      this._processInputNode(c.from, src, inL, inR, visited);
    }

    const rev = this._getReverbInstance(nodeId);
    try {
      if (typeof data.feedback === 'number') rev.feedback = data.feedback;
      if (typeof data.wetMix === 'number') rev.wet_mix = data.wetMix;

      const temp = new Float32Array(N);
      // Use left as mono input for now
      rev.process(inL, temp);

      for (let i = 0; i < N; i++) {
        const s = temp[i];
        outL[i] += s;
        outR[i] += s;
      }
    } catch { /* ignore per-block errors */ }
  }

  // Recursively process an input node and mix into outL/outR
  _processInputNode(nodeId, data, outL, outR, visited = new Set()) {
    if (!data || !data.type) return;
    if (visited.has(nodeId)) return; // break cycles
    visited.add(nodeId);

    switch (data.type) {
      case 'oscillator':
        this._processOscillator(nodeId, data, outL, outR);
        break;
      case 'synth':
        this._processSynth(nodeId, data, outL, outR);
        break;
      case 'reverb':
        this._processReverb(nodeId, data, outL, outR, visited);
        break;
      default:
        // Unknown/parameter-only node, ignore
        break;
    }
  }

  // Entry point: render graph by starting at speaker sinks and mixing upstream
  _processGraph(outL, outR) {
    const speakers = [];
    for (const [nodeId, data] of this._nodes.entries()) {
      if (data && data.type === 'speaker') {
        speakers.push({ nodeId, data });
      }
    }

    if (speakers.length === 0) {
      // No explicit sinks; as a fallback, mix any source nodes directly
      for (const [nodeId, data] of this._nodes.entries()) {
        if (!data || !data.type) continue;
        if (data.type === 'oscillator' || data.type === 'synth') {
          this._processInputNode(nodeId, data, outL, outR);
        }
      }
      return;
    }

    const N = outL.length;
    for (const { nodeId, data } of speakers) {
      const sumL = new Float32Array(N);
      const sumR = new Float32Array(N);

      // Find audio inputs wired into the speaker
      const inputs = this._connections.filter(
        (c) => c.to === nodeId && c.toInput === 'input' && (c.fromOutput === 'output' || !c.fromOutput)
      );

      for (const c of inputs) {
        const src = this._nodes.get(c.from);
        if (!src) continue;
        this._processInputNode(c.from, src, sumL, sumR, new Set());
      }

      let gain = 1.0;
      if (typeof data.volume === 'number') gain = data.volume;
      if (data.muted) gain = 0;

      for (let i = 0; i < N; i++) {
        outL[i] += sumL[i] * gain;
        outR[i] += sumR[i] * gain;
      }
    }
  }
}

// Correct registration name expected by AudioManager
registerProcessor('audio-engine-processor', EngineProcessor);
