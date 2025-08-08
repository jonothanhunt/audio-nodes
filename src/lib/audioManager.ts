// src/lib/audioManager.ts

// Types for our audio nodes
interface AudioNodeData {
  type: string;
  frequency?: number;
  amplitude?: number;
  waveform?: string;
  feedback?: number;
  wetMix?: number;
  volume?: number;
  muted?: boolean;
  // Synth params
  preset?: string; attack?: number; decay?: number; sustain?: number; release?: number;
  cutoff?: number; resonance?: number; glide?: number; gain?: number; maxVoices?: number;
}

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private audioWorklet: AudioWorkletNode | null = null;
  private isInitialized = false;
  private wasmReady = false; // set true when worklet reports ready
  private sampleRate = 44100;
  private audioNodes: Map<string, AudioNodeData> = new Map();
  private nodeConnections: Array<{ from: string; to: string; fromOutput: string; toInput: string }> = [];

  constructor() {
    // Worklet loads WASM itself; nothing to do here.
  }

  // Remove functions/undefined and deep-clone only structured-cloneable values
  private sanitizeForPostMessage(value: unknown, seen: WeakSet<object> = new WeakSet<object>()): unknown {
    const t = typeof value;
    if (value === null || t === 'number' || t === 'string' || t === 'boolean') return value;
    if (t === 'undefined' || t === 'function' || t === 'symbol') return undefined;

    if (Array.isArray(value)) {
      const out: unknown[] = [];
      for (const item of value) {
        const v = this.sanitizeForPostMessage(item, seen);
        if (v !== undefined) out.push(v);
      }
      return out;
    }

    if (t === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      if (seen.has(obj as unknown as object)) return undefined;
      seen.add(obj as unknown as object);
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'function' || k.startsWith('on')) continue;
        const sv = this.sanitizeForPostMessage(v, seen);
        if (sv !== undefined) out[k] = sv;
      }
      return out;
    }

    return undefined;
  }

  async initializeAudio() {
    if (this.isInitialized) {
      return true;
    }

    try {
      const AudioContextClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioContextClass();

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.sampleRate = this.audioContext.sampleRate;
      // Load the AudioWorklet module with cache-busting
      const v = Date.now();
      await this.audioContext.audioWorklet.addModule(`/worklets/audio-engine-processor.js?v=${v}`);

      // Create the node
      const workletNode = new AudioWorkletNode(this.audioContext, 'audio-engine-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      // Wire message channel
      workletNode.port.onmessage = (e: MessageEvent) => {
        const msg = e.data;
        if (!msg || typeof msg !== 'object') return;
        switch (msg.type) {
          case 'ready':
            this.wasmReady = true;
            // Push current graph state
            this.flushGraphToWorklet();
            // Send timebase sync
            try {
              const perfNowMs = performance.now();
              const audioCurrentTimeSec = this.audioContext ? this.audioContext.currentTime : 0;
              workletNode.port.postMessage({ type: 'timebase', perfNowMs, audioCurrentTimeSec });
            } catch {}
            break;
          case 'needBootstrap':
            this.bootstrapWasmToWorklet();
            break;
          case 'error':
            console.error('[AudioWorklet]', msg.message);
            break;
          default:
            break;
        }
      };

      // Proactively bootstrap to avoid missing early needBootstrap messages
      this.bootstrapWasmToWorklet();

      // Connect to destination
      workletNode.connect(this.audioContext.destination);

      this.audioWorklet = workletNode;
      this.isInitialized = true;
      console.log('AudioWorklet initialized at sampleRate', this.sampleRate);
      return true;
    } catch (error) {
      console.error('Failed to initialize audio:', error);
      return false;
    }
  }

  private flushGraphToWorklet() {
    if (!this.audioWorklet) return;
    this.audioWorklet.port.postMessage({ type: 'clear' });
    for (const [nodeId, data] of this.audioNodes.entries()) {
      this.audioWorklet.port.postMessage({ type: 'updateNode', nodeId, data });
    }
    this.audioWorklet.port.postMessage({ type: 'updateConnections', connections: this.nodeConnections });
  }

  stopAudio() {
    try {
      if (this.audioWorklet) {
        try { this.audioWorklet.port.postMessage({ type: 'clear' }); } catch {}
        this.audioWorklet.disconnect();
        this.audioWorklet = null;
      }
      if (this.audioContext) {
        this.audioContext.close();
        this.audioContext = null;
      }
    } finally {
      this.isInitialized = false;
      this.wasmReady = false;
    }
  }

  updateNode(nodeId: string, nodeData: AudioNodeData) {
    const clean = this.sanitizeForPostMessage(nodeData) as AudioNodeData;
    this.audioNodes.set(nodeId, clean);
    if (this.audioWorklet) {
      this.audioWorklet.port.postMessage({ type: 'updateNode', nodeId, data: clean });
    }
  }

  removeNode(nodeId: string) {
    this.audioNodes.delete(nodeId);
    if (this.audioWorklet) {
      this.audioWorklet.port.postMessage({ type: 'removeNode', nodeId });
    }
  }

  updateConnections(connections: Array<{ from: string; to: string; fromOutput: string; toInput: string }>) {
    this.nodeConnections = connections;
    if (this.audioWorklet) {
      this.audioWorklet.port.postMessage({ type: 'updateConnections', connections });
    }
  }

  sendMIDI(sourceId: string, events: Array<{ data: [number, number, number]; atFrame?: number; atTimeMs?: number }>) {
    if (!this.audioWorklet) return;
    // Sanitize events
    const cleanEvents = (Array.isArray(events) ? events : []).map((e) => ({
      data: [Number(e.data?.[0] || 0) & 0xff, Number(e.data?.[1] || 0) & 0x7f, Number(e.data?.[2] || 0) & 0x7f] as [number, number, number],
      atFrame: typeof e.atFrame === 'number' ? Math.max(0, Math.floor(e.atFrame)) : undefined,
      atTimeMs: typeof e.atTimeMs === 'number' ? e.atTimeMs : undefined,
    }));
    this.audioWorklet.port.postMessage({ type: 'midi', sourceId, events: cleanEvents });
  }

  isReady(): boolean {
    return this.wasmReady;
  }

  private async bootstrapWasmToWorklet() {
    if (!this.audioWorklet) return;
    try {
      const cacheBust = Date.now();
      const [glueRes, wasmRes] = await Promise.all([
        fetch(`/audio-engine-wasm/audio_engine.js?v=${cacheBust}`),
        fetch(`/audio-engine-wasm/audio_engine_bg.wasm?v=${cacheBust}`),
      ]);
      const glue = await glueRes.text();
      const wasm = await wasmRes.arrayBuffer();
      this.audioWorklet.port.postMessage({ type: 'bootstrapWasm', glue, wasm });
    } catch (err) {
      console.error('Failed to bootstrap WASM into worklet:', err);
    }
  }
}
