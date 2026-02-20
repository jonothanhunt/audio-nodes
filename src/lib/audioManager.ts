import { AudioNodeData } from './audio/types';
import { encodeWav } from './audio/WavEncoder';
import { GraphSync } from './audio/GraphSync';
import { Transport } from './audio/Transport';

export class AudioManager {
    private audioContext: AudioContext | null = null;
    private audioWorklet: AudioWorkletNode | null = null;
    private isInitialized = false;
    private wasmReady = false;
    private sampleRate = 44100;
    private timebaseTimer: number | null = null;

    private graphSync = new GraphSync();
    private transport = new Transport();

    private recording: {
        startTime: number;
        onStop?: (blob: Blob, durationSec: number) => void;
        wav?: {
            enabled: boolean;
            pcmL: Float32Array[];
            pcmR: Float32Array[];
        };
    } | null = null;

    private modPreviewListeners: Set<(nodeId: string, data: Record<string, number>) => void> = new Set();
    private previewMuteDepth = 0;
    private userMuted = false;
    private masterGain: GainNode | null = null;

    async initializeAudio() {
        if (this.isInitialized) return true;

        try {
            const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            this.audioContext = new AudioContextClass();
            if (this.audioContext.state === "suspended") await this.audioContext.resume();

            this.sampleRate = this.audioContext.sampleRate;
            const v = Date.now();
            await this.audioContext.audioWorklet.addModule(`/worklets/audio-engine-processor.js?v=${v}`);

            const workletNode = new AudioWorkletNode(this.audioContext, "audio-engine-processor", {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [2],
            });

            this.graphSync.setWorklet(workletNode);
            this.transport.setWorklet(workletNode);

            workletNode.port.onmessage = (e: MessageEvent) => {
                const msg = e.data;
                if (!msg || typeof msg !== "object") return;

                // Transport handles beats, steps, arp
                this.transport.handleWorkletMessage(msg);

                switch (msg.type) {
                    case "ready":
                        this.wasmReady = true;
                        this.graphSync.flushGraphToWorklet();
                        try {
                            const perfNowMs = performance.now();
                            const audioCurrentTimeSec = this.audioContext ? this.audioContext.currentTime : 0;
                            workletNode.port.postMessage({ type: "timebase", perfNowMs, audioCurrentTimeSec });
                        } catch { }
                        break;
                    case "needBootstrap":
                        this.bootstrapWasmToWorklet();
                        break;
                    case "error":
                        console.error("[AudioWorklet]", msg.message);
                        break;
                    case 'modPreview': {
                        const nid = String(msg.nodeId || '');
                        if (nid && msg.data && typeof msg.data === 'object') {
                            const clean: Record<string, number> = {};
                            for (const [k, v] of Object.entries(msg.data)) {
                                if (typeof v === 'number' && isFinite(v)) clean[k] = v;
                            }
                            this.modPreviewListeners.forEach(cb => { try { cb(nid, clean); } catch { } });
                            try { window.dispatchEvent(new CustomEvent('audioNodesNodeRendered', { detail: { nodeId: nid, data: clean } })); } catch { }
                        }
                        break;
                    }
                }
            };

            try {
                workletNode.port.addEventListener('message', (e: MessageEvent) => {
                    const data = e.data;
                    if (!data || typeof data !== 'object') return;
                    if (data.type === 'captureBlock' && this.recording && this.recording.wav && this.recording.wav.enabled) {
                        const { left, right } = data;
                        if (left && right && left.length === right.length) {
                            this.recording.wav.pcmL.push(left);
                            this.recording.wav.pcmR.push(right);
                        }
                    }
                });
            } catch { }

            this.bootstrapWasmToWorklet();

            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 1;
            workletNode.connect(this.masterGain);
            this.masterGain.connect(this.audioContext.destination);

            this.audioWorklet = workletNode;
            this.isInitialized = true;

            try {
                if (this.timebaseTimer != null) clearInterval(this.timebaseTimer);
                this.timebaseTimer = window.setInterval(() => {
                    if (!this.audioWorklet || !this.audioContext) return;
                    const perfNowMs = performance.now();
                    const audioCurrentTimeSec = this.audioContext.currentTime;
                    try { this.audioWorklet.port.postMessage({ type: "timebase", perfNowMs, audioCurrentTimeSec }); } catch { }
                }, 1000);
            } catch { }
            return true;
        } catch (error) {
            console.error("Failed to initialize audio:", error);
            return false;
        }
    }

    stopAudio() {
        try {
            this.graphSync.clear();
            if (this.audioWorklet) {
                this.audioWorklet.disconnect();
                this.audioWorklet = null;
            }
            if (this.audioContext) {
                this.audioContext.close();
                this.audioContext = null;
            }
            if (this.timebaseTimer != null) {
                try { clearInterval(this.timebaseTimer); } catch { }
                this.timebaseTimer = null;
            }
        } finally {
            this.isInitialized = false;
            this.wasmReady = false;
            this.recording = null;
            this.graphSync.setWorklet(null);
            this.transport.setWorklet(null);
        }
    }

    isReady(): boolean { return this.wasmReady; }

    private async bootstrapWasmToWorklet() {
        if (!this.audioWorklet) return;
        try {
            const cacheBust = Date.now();
            const [glueRes, wasmRes] = await Promise.all([
                fetch(`/audio-engine-wasm/audio_engine.js?v=${cacheBust}`),
                fetch(`/audio-engine-wasm/audio_engine_bg.wasm?v=${cacheBust}`),
            ]);

            if (!glueRes.ok || !wasmRes.ok) {
                this.audioWorklet.port.postMessage({
                    type: "error", message: `WASM assets missing. Ensure public/audio-engine-wasm is present.`
                });
                return;
            }
            const glue = await glueRes.text();
            const wasm = await wasmRes.arrayBuffer();
            this.audioWorklet.port.postMessage({ type: "bootstrapWasm", glue, wasm });
        } catch (err) {
            console.error("Failed to bootstrap WASM into worklet:", err);
        }
    }

    // --- GraphSync API ---
    updateNode(nodeId: string, nodeData: AudioNodeData) { this.graphSync.updateNode(nodeId, nodeData); }
    removeNode(nodeId: string) { this.graphSync.removeNode(nodeId); }
    updateConnections(connections: { from: string; to: string; fromOutput: string; toInput: string; }[]) { this.graphSync.updateConnections(connections); }

    // --- Transport API ---
    setBpm(next: number) { this.transport.setBpm(next); }
    getBpm() { return this.transport.getBpm(); }
    syncAllNextBeat() { this.transport.syncAllNextBeat(); }
    onBeat(cb: (beat: number, bpm: number) => void) { return this.transport.onBeat(cb); }
    onSequencerStep(cb: (nodeId: string, stepIndex: number) => void) { return this.transport.onSequencerStep(cb); }
    onArpNote(cb: (nodeId: string, note: number) => void) { return this.transport.onArpNote(cb); }
    setSequencerRate(n: string, m: number) { this.transport.setSequencerRate(n, m); }
    setSequencerPlay(n: string, p: boolean) { this.transport.setSequencerPlay(n, p); }
    setArpPlay(n: string, p: boolean) { this.transport.setArpPlay(n, p); }
    setArpRate(n: string, m: number) { this.transport.setArpRate(n, m); }
    panic() { this.transport.panic(); }
    sendMIDI(s: string, e: Array<{ data: [number, number, number]; atFrame?: number; atTimeMs?: number }>) { this.transport.sendMIDI(s, e); }

    // --- Recording API ---
    startRecording(onStop?: (blob: Blob, dur: number) => void): boolean {
        if (!this.audioContext || !this.audioWorklet) return false;
        if (this.recording && this.isRecording()) return false;
        try { if (this.audioWorklet.numberOfOutputs && this.audioContext.destination) this.audioWorklet.connect(this.audioContext.destination); } catch { }
        this.recording = { startTime: performance.now(), onStop, wav: { enabled: true, pcmL: [], pcmR: [] } };
        try { this.audioWorklet.port.postMessage({ type: 'startCapture' }); } catch { }
        return true;
    }

    stopRecording(): boolean {
        if (!this.recording) return false;
        if (this.recording.wav && this.recording.wav.enabled) {
            try { this.audioWorklet?.port.postMessage({ type: 'stopCapture' }); } catch { }
            const { pcmL, pcmR } = this.recording.wav;
            if (!pcmL.length) return false;
            const totalSamples = pcmL.reduce((a, b) => a + b.length, 0);
            const interleaved = new Float32Array(totalSamples * 2);
            let offset = 0;
            for (let i = 0; i < pcmL.length; i++) {
                const L = pcmL[i]; const R = (pcmR[i] && pcmR[i].length === L.length) ? pcmR[i] : L;
                for (let j = 0; j < L.length; j++) {
                    interleaved[offset++] = L[j];
                    interleaved[offset++] = R[j];
                }
            }
            const wavBuffer = encodeWav(interleaved, 2, this.sampleRate);
            const blob = new Blob([wavBuffer], { type: 'audio/wav' });
            const dur = (performance.now() - this.recording.startTime) / 1000;
            if (this.recording.onStop) { try { this.recording.onStop(blob, dur); } catch { } }
            this.recording.wav.enabled = false;
            this.recording = null;
            return true;
        }
        return false;
    }
    isRecording(): boolean { return !!(this.recording && this.recording.wav && this.recording.wav.enabled); }

    // --- Preview mute API ---
    private updateMasterGainVolume() {
        if (!this.masterGain) return;
        this.masterGain.gain.value = (this.userMuted || this.previewMuteDepth > 0) ? 0 : 1;
    }
    async muteForPreview() { this.previewMuteDepth++; this.updateMasterGainVolume(); }
    async resumeFromPreview() { if (this.previewMuteDepth > 0) this.previewMuteDepth--; this.updateMasterGainVolume(); }
    setUserMuted(muted: boolean) { this.userMuted = !!muted; this.updateMasterGainVolume(); }
    isUserMuted() { return this.userMuted; }
}
