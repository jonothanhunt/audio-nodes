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

type AudioEngineWasm = typeof import('@/audio-engine-wasm/audio_engine');

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private audioWorklet: ScriptProcessorNode | null = null;
  private isInitialized = false;
  private isAudioEnabled = false;
  private wasmReady = false;
  private sampleRate = 44100;
  private bufferSize = 512;
  private wasmModule: AudioEngineWasm | null = null;
  private audioNodes: Map<string, AudioNodeData> = new Map();
  private nodeConnections: Array<{ from: string; to: string; fromOutput: string; toInput: string }> = [];

  constructor() {
    this.loadWasm();
  }

  private async loadWasm() {
    try {
      // Load WASM module without initializing audio context
      const wasmModule = await import('@/audio-engine-wasm/audio_engine');
      
      // Initialize the WASM module - this is crucial!
      await wasmModule.default();
      
      this.wasmModule = wasmModule;
      this.wasmReady = true;
      console.log('WASM module loaded and initialized');
      console.log('Available WASM exports:', Object.keys(wasmModule));
    } catch (error) {
      console.error('Failed to load WASM:', error);
      this.wasmReady = false;
    }
  }

  async initializeAudio() {
    if (this.isInitialized) {
      return true;
    }

    // Wait for WASM to be ready
    if (!this.wasmReady) {
      console.log('Waiting for WASM module to load...');
      // Wait for WASM to load (with timeout)
      let retries = 0;
      while (!this.wasmReady && retries < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
      }
      
      if (!this.wasmReady) {
        console.error('WASM module failed to load in time');
        return false;
      }
    }

    try {
      // Initialize Web Audio API - this requires user gesture
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioContextClass({
        sampleRate: this.sampleRate,
      });
      
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      console.log('Audio Context initialized:', this.audioContext.sampleRate);
      
      // Start audio processing immediately
      await this.startAudioProcessing();
      
      this.isInitialized = true;
      this.isAudioEnabled = true;
      console.log('Audio Manager fully initialized and started');
      return true;
    } catch (error) {
      console.error('Failed to initialize audio:', error);
      return false;
    }
  }

  private async startAudioProcessing() {
    if (!this.audioContext || !this.wasmModule) {
      throw new Error('Audio context or WASM module not available');
    }

    try {
      // Create a ScriptProcessorNode for now (we'll upgrade to AudioWorklet later)
      const processor = this.audioContext.createScriptProcessor(this.bufferSize, 0, 2);
      
      processor.onaudioprocess = (event) => {
        this.processAudio(event);
      };

      // Connect to destination
      processor.connect(this.audioContext.destination);
      
      this.audioWorklet = processor;
      console.log('Audio processing started');
    } catch (error) {
      console.error('Failed to start audio processing:', error);
      throw error;
    }
  }

  stopAudio() {
    if (this.audioWorklet) {
      this.audioWorklet.disconnect();
      this.audioWorklet = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.isInitialized = false;
    this.isAudioEnabled = false;
    console.log('Audio system stopped');
  }

  private processAudio(event: AudioProcessingEvent) {
    const outputL = event.outputBuffer.getChannelData(0);
    const outputR = event.outputBuffer.getChannelData(1);
    
    // Clear output buffers
    outputL.fill(0);
    outputR.fill(0);

    // Process each audio node in the graph
    this.processNodeGraph(outputL, outputR);
  }

  private processNodeGraph(outputL: Float32Array, outputR: Float32Array) {
    // Check if WASM is ready
    if (!this.wasmReady || !this.wasmModule) {
      console.warn('WASM module not ready for audio processing');
      return;
    }

    // Process audio by starting from speaker nodes and tracing backwards
    // Only speaker nodes can output to the final audio buffer
    this.audioNodes.forEach((nodeData, nodeId) => {
      if (nodeData.type === 'speaker') {
        this.processSpeakerNode(nodeId, nodeData, outputL, outputR);
      }
    });
  }

  private processSpeakerNode(speakerId: string, speakerData: AudioNodeData, outputL: Float32Array, outputR: Float32Array) {
    if (!this.wasmModule || speakerData.muted) {
      return; // Skip muted speakers
    }

    // Find all connections feeding into this speaker
    const inputConnections = this.nodeConnections.filter(conn => conn.to === speakerId);
    
    if (inputConnections.length === 0) {
      // No inputs connected to this speaker - no sound should play
      return;
    }

    // Create a temporary buffer to collect all inputs to this speaker
    const speakerInputL = new Float32Array(this.bufferSize);
    const speakerInputR = new Float32Array(this.bufferSize);

    // Process each input connection
    inputConnections.forEach(connection => {
      const inputNodeData = this.audioNodes.get(connection.from);
      if (!inputNodeData) return;

      // Process the input node and add its output to speaker input
      this.processInputNode(connection.from, inputNodeData, speakerInputL, speakerInputR);
    });

    // Apply speaker processing (volume, etc.) and mix to final output
    const volume = speakerData.volume || 0.8;
    for (let i = 0; i < this.bufferSize; i++) {
      outputL[i] += speakerInputL[i] * volume;
      outputR[i] += speakerInputR[i] * volume;
    }
  }

  private processInputNode(nodeId: string, nodeData: AudioNodeData, outputL: Float32Array, outputR: Float32Array) {
    if (!this.wasmModule) return;

    switch (nodeData.type) {
      case 'oscillator':
        this.processOscillatorNode(nodeId, nodeData, outputL, outputR);
        break;
      case 'reverb':
        this.processReverbNode(nodeId, nodeData, outputL, outputR);
        break;
      // Add other node types as needed
    }
  }

  private processOscillatorNode(nodeId: string, nodeData: AudioNodeData, outputL: Float32Array, outputR: Float32Array) {
    if (!this.wasmModule) return;

    try {
      const oscillator = new this.wasmModule.OscillatorNode(this.sampleRate);
      oscillator.frequency = nodeData.frequency || 440;
      oscillator.amplitude = nodeData.amplitude || 0.5;
      oscillator.set_waveform(this.getWaveformIndex(nodeData.waveform || 'sine'));
      
      // Create temporary buffer for oscillator output
      const tempBuffer = new Float32Array(this.bufferSize);
      oscillator.process(tempBuffer);
      
      // Mix oscillator output into the provided buffers (mono to stereo)
      for (let i = 0; i < this.bufferSize; i++) {
        const sample = tempBuffer[i];
        outputL[i] += sample;
        outputR[i] += sample;
      }
      
      oscillator.free();
    } catch (error) {
      console.error(`Error processing oscillator node ${nodeId}:`, error);
    }
  }

  private processReverbNode(nodeId: string, nodeData: AudioNodeData, outputL: Float32Array, outputR: Float32Array) {
    if (!this.wasmModule) return;

    // Find inputs to this reverb node
    const inputConnections = this.nodeConnections.filter(conn => conn.to === nodeId);
    
    if (inputConnections.length === 0) {
      return; // No inputs to process
    }

    try {
      const reverb = new this.wasmModule.ReverbNode(this.sampleRate);
      reverb.feedback = nodeData.feedback || 0.3;
      reverb.wet_mix = nodeData.wetMix || 0.3;

      // Create buffers for reverb input
      const reverbInputL = new Float32Array(this.bufferSize);
      const reverbInputR = new Float32Array(this.bufferSize);

      // Process all inputs to this reverb node
      inputConnections.forEach(connection => {
        const inputNodeData = this.audioNodes.get(connection.from);
        if (inputNodeData) {
          this.processInputNode(connection.from, inputNodeData, reverbInputL, reverbInputR);
        }
      });

      // Apply reverb processing (assuming mono input for now)
      const tempOutput = new Float32Array(this.bufferSize);
      reverb.process(reverbInputL, tempOutput);

      // Mix reverb output into provided buffers
      for (let i = 0; i < this.bufferSize; i++) {
        const sample = tempOutput[i];
        outputL[i] += sample;
        outputR[i] += sample;
      }

      reverb.free();
    } catch (error) {
      console.error(`Error processing reverb node ${nodeId}:`, error);
    }
  }

  private getWaveformIndex(waveform: string): number {
    switch (waveform) {
      case 'sine': return 0;
      case 'square': return 1;
      case 'sawtooth': return 2;
      case 'triangle': return 3;
      default: return 0;
    }
  }

  updateNode(nodeId: string, nodeData: AudioNodeData) {
    this.audioNodes.set(nodeId, nodeData);
  }

  removeNode(nodeId: string) {
    this.audioNodes.delete(nodeId);
  }

  updateConnections(connections: Array<{ from: string; to: string; fromOutput: string; toInput: string }>) {
    this.nodeConnections = connections;
  }

  isReady(): boolean {
    return this.wasmReady && this.wasmModule !== null;
  }

  isAudioInitialized(): boolean {
    return this.isInitialized && this.isAudioEnabled;
  }

  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }
}
