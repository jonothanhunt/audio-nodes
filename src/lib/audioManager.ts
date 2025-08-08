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
}

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private audioWorklet: AudioWorkletNode | null = null;
  private isInitialized = false;
  private isAudioEnabled = false;
  private wasmReady = false; // set true when worklet reports ready
  private sampleRate = 44100;
  private bufferSize = 512; // not used by worklet (quantum = 128), kept for compatibility
  private wasmModule: unknown | null = null; // no longer used on main thread
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
      // Load the AudioWorklet module
      await this.audioContext.audioWorklet.addModule('/worklets/audio-engine-processor.js');

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
            break;
          case 'needBootstrap':
            this.bootstrapWasmToWorklet();
            break;
          case 'ackBootstrap':
            console.log('[AudioWorklet] bootstrap ack');
            break;
          case 'ackNode':
            console.log('[AudioWorklet] node ack', msg.nodeId);
            break;
          case 'ackRemove':
            console.log('[AudioWorklet] remove ack', msg.nodeId);
            break;
          case 'ackConnections':
            console.log('[AudioWorklet] connections ack', msg.count);
            break;
          case 'ackClear':
            console.log('[AudioWorklet] clear ack');
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
      this.isAudioEnabled = true;
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
      this.isAudioEnabled = false;
      this.wasmReady = false;
      console.log('Audio system stopped');
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

  isReady(): boolean {
    return this.wasmReady;
  }

  isAudioInitialized(): boolean {
    return this.isInitialized && this.isAudioEnabled;
  }

  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  private async bootstrapWasmToWorklet() {
    if (!this.audioWorklet) return;
    try {
      const [glueRes, wasmRes] = await Promise.all([
        fetch('/audio-engine-wasm/audio_engine.js'),
        fetch('/audio-engine-wasm/audio_engine_bg.wasm'),
      ]);
      const glue = await glueRes.text();
      const wasm = await wasmRes.arrayBuffer();
      this.audioWorklet.port.postMessage({ type: 'bootstrapWasm', glue, wasm });
    } catch (err) {
      console.error('Failed to bootstrap WASM into worklet:', err);
    }
  }
}
