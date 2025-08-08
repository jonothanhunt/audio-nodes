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
      // Transform ESM glue to globals and evaluate in worklet scope
      let code = String(glueCode);
      code = code.replace(/^export\s+class\s+/gm, 'class ');
      code = code.replace(/export\s*\{\s*initSync\s*\};?/gm, 'globalThis.__wbg_initSync = initSync;');
      code = code.replace(/export\s+default\s+__wbg_init\s*;?/gm, 'globalThis.__wbg_init_default = __wbg_init;');
      code = code.replace(/import\.meta\.url/g, "'/audio-engine-wasm/'");
      code += '\nglobalThis.AudioEngine = typeof AudioEngine !== "undefined" ? AudioEngine : undefined;';
      code += '\nglobalThis.OscillatorNode = typeof OscillatorNode !== "undefined" ? OscillatorNode : undefined;';
      code += '\nglobalThis.ReverbNode = typeof ReverbNode !== "undefined" ? ReverbNode : undefined;';
      code += '\nglobalThis.SpeakerNode = typeof SpeakerNode !== "undefined" ? SpeakerNode : undefined;';
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
      };
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
        this._oscInstances.clear();
        this._reverbInstances.clear();
        try { this.port.postMessage({ type: 'ackClear' }); } catch {}
        break;
      }
      default:
        break;
    }
  }

  static get parameterDescriptors() { return []; }

  process(inputs, outputs /*, parameters */) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const outL = output[0];
    const outR = output[1] || output[0]; // mono if only one channel configured

    // Clear
    outL.fill(0);
    outR.fill(0);

    if (!this._ready || !this._wasm) {
      // Not ready yet, output silence
      return true;
    }

    try {
      this._processGraph(outL, outR);
    } catch (err) {
      // Swallow errors to avoid stopping audio; report to main thread
      try { this.port.postMessage({ type: 'error', message: String(err) }); } catch {}
    }

    return true;
  }

  _processGraph(outL, outR) {
    // Start at speakers
    for (const [nodeId, data] of this._nodes.entries()) {
      if (data?.type === 'speaker') {
        this._processSpeaker(nodeId, data, outL, outR);
      }
    }
  }

  _processSpeaker(speakerId, speakerData, outL, outR) {
    if (!this._wasm || speakerData?.muted) return;

    // Only accept audio connections: from 'output' -> to 'input'
    const inputs = this._connections.filter(
      (c) => c.to === speakerId && c.toInput === 'input' && (c.fromOutput === 'output' || !c.fromOutput)
    );
    if (inputs.length === 0) return;

    const N = outL.length;
    const tmpL = new Float32Array(N);
    const tmpR = new Float32Array(N);

    for (const c of inputs) {
      const srcData = this._nodes.get(c.from);
      if (!srcData) continue;
      this._processInputNode(c.from, srcData, tmpL, tmpR);
    }

    const volume = typeof speakerData.volume === 'number' ? speakerData.volume : 0.8;
    for (let i = 0; i < N; i++) {
      outL[i] += tmpL[i] * volume;
      outR[i] += tmpR[i] * volume;
    }
  }

  _processInputNode(nodeId, nodeData, outL, outR) {
    switch (nodeData.type) {
      case 'oscillator':
        this._processOscillator(nodeId, nodeData, outL, outR);
        break;
      case 'reverb':
        this._processReverb(nodeId, nodeData, outL, outR);
        break;
      default:
        break;
    }
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

  _processReverb(nodeId, data, outL, outR) {
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
      this._processInputNode(c.from, src, inL, inR);
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
}

registerProcessor('audio-engine-processor', EngineProcessor);
