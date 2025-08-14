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
    preset?: string;
    attack?: number;
    decay?: number;
    sustain?: number;
    release?: number;
    cutoff?: number;
    resonance?: number;
    glide?: number;
    gain?: number;
    maxVoices?: number;
}

export class AudioManager {
    private audioContext: AudioContext | null = null;
    private audioWorklet: AudioWorkletNode | null = null;
    private isInitialized = false;
    private wasmReady = false; // set true when worklet reports ready
    private sampleRate = 44100;
    private timebaseTimer: number | null = null;
    // Transport state (UI-observable)
    private bpm = 120;
    private beatListeners: Set<(beat: number, bpm: number) => void> = new Set();
    private sequencerStepListeners: Set<(nodeId: string, stepIndex: number) => void> = new Set();
    private arpTickListeners: Set<(nodeId: string, note: number) => void> = new Set();
    private recording: {
    mediaRecorder: MediaRecorder | null; // retained for legacy shape; always null in WAV-only mode
    chunks: Blob[]; // unused for WAV; kept to avoid breaking callers expecting property
        startTime: number;
        onStop?: (blob: Blob, durationSec: number) => void;
        wav?: {
            enabled: boolean;
            pcmL: Float32Array[];
            pcmR: Float32Array[];
        };
    } | null = null;
    private modPreviewListeners: Set<(nodeId: string, data: Record<string, number>) => void> = new Set();
    private audioNodes: Map<string, AudioNodeData> = new Map();
    private nodeConnections: Array<{
        from: string;
        to: string;
        fromOutput: string;
        toInput: string;
    }> = [];
    private previewMuteDepth = 0;
    private userMuted = false;
    private masterGain: GainNode | null = null;

    constructor() {
        // Worklet loads WASM itself; nothing to do here.
    }

    // Remove functions/undefined and deep-clone only structured-cloneable values
    private sanitizeForPostMessage(
        value: unknown,
        seen: WeakSet<object> = new WeakSet<object>(),
    ): unknown {
        const t = typeof value;
        if (
            value === null ||
            t === "number" ||
            t === "string" ||
            t === "boolean"
        )
            return value;
        if (t === "undefined" || t === "function" || t === "symbol")
            return undefined;

        if (Array.isArray(value)) {
            const out: unknown[] = [];
            for (const item of value) {
                const v = this.sanitizeForPostMessage(item, seen);
                if (v !== undefined) out.push(v);
            }
            return out;
        }

        if (t === "object" && value !== null) {
            const obj = value as Record<string, unknown>;
            if (seen.has(obj as unknown as object)) return undefined;
            seen.add(obj as unknown as object);
            const out: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(obj)) {
                if (typeof v === "function" || k.startsWith("on")) continue;
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
                window.AudioContext ||
                (
                    window as unknown as {
                        webkitAudioContext: typeof AudioContext;
                    }
                ).webkitAudioContext;
            this.audioContext = new AudioContextClass();

            if (this.audioContext.state === "suspended") {
                await this.audioContext.resume();
            }

            this.sampleRate = this.audioContext.sampleRate;
            // Load the AudioWorklet module with cache-busting
            const v = Date.now();
            await this.audioContext.audioWorklet.addModule(
                `/worklets/audio-engine-processor.js?v=${v}`,
            );

            // Create the node
            const workletNode = new AudioWorkletNode(
                this.audioContext,
                "audio-engine-processor",
                {
                    numberOfInputs: 0,
                    numberOfOutputs: 1,
                    outputChannelCount: [2],
                },
            );

            // Wire message channel
            workletNode.port.onmessage = (e: MessageEvent) => {
                const msg = e.data;
                if (!msg || typeof msg !== "object") return;
                switch (msg.type) {
                    case "ready":
                        this.wasmReady = true;
                        // Push current graph state
                        this.flushGraphToWorklet();
                        // Send timebase sync
                        try {
                            const perfNowMs = performance.now();
                            const audioCurrentTimeSec = this.audioContext
                                ? this.audioContext.currentTime
                                : 0;
                            workletNode.port.postMessage({
                                type: "timebase",
                                perfNowMs,
                                audioCurrentTimeSec,
                            });
                        } catch {}
                        break;
                    case "needBootstrap":
                        this.bootstrapWasmToWorklet();
                        break;
                    case "error":
                        console.error("[AudioWorklet]", msg.message);
                        break;
                    case "beat": {
                        const beat = Number(msg.beatIndex) || 0;
                        const bpm = Number(msg.bpm) || this.bpm;
                        this.bpm = bpm;
                        this.beatListeners.forEach((cb) => { try { cb(beat, bpm); } catch {} });
                        break;
                    }
                    case "sequencerStep": {
                        const nid = String(msg.nodeId || "");
                        const stepIndex = Number(msg.stepIndex) || 0;
                        if (nid) {
                            this.sequencerStepListeners.forEach((cb) => { try { cb(nid, stepIndex); } catch { /* ignore */ } });
                        }
                        break;
                    }
                    case "arpNote": {
                        const nid = String(msg.nodeId || "");
                        const note = Number(msg.note) || 0;
                        if (nid) {
                            this.arpTickListeners.forEach(cb=>{ try { cb(nid, note); } catch {} });
                        }
                        break;
                    }
                    case 'modPreview': {
                        const nid = String(msg.nodeId || '');
                        if (nid && msg.data && typeof msg.data === 'object') {
                            const clean: Record<string, number> = {};
                            for (const [k,v] of Object.entries(msg.data)) {
                                if (typeof v === 'number' && isFinite(v)) clean[k] = v;
                            }
                            this.modPreviewListeners.forEach(cb=>{ try { cb(nid, clean); } catch {} });
                            // Also broadcast DOM CustomEvent for React hooks not directly registered
                            try {
                                window.dispatchEvent(new CustomEvent('audioNodesNodeRendered', { detail: { nodeId: nid, data: clean } }));
                            } catch {}
                        }
                        break;
                    }
                    case "syncScheduled": {
                        // Could surface a UI confirmation if desired
                        break;
                    }
                    default:
                        break;
                }
            };

            // Capture raw PCM blocks for WAV when recording with wav option
            try {
                workletNode.port.addEventListener('message', (e: MessageEvent) => {
                    const data = e.data;
                    if (!data || typeof data !== 'object') return;
                    if (data.type === 'captureBlock' && this.recording && this.recording.wav && this.recording.wav.enabled) {
                        // Reconstruct Float32Array from transferable buffers (already Float32Array instances)
                        const { left, right } = data;
                        if (left && right && left.length === right.length) {
                            this.recording.wav.pcmL.push(left);
                            this.recording.wav.pcmR.push(right);
                        }
                    } else if (data.type === 'captureStopped') {
                        // finalize if still active
                    }
                });
            } catch {}

            // Proactively bootstrap to avoid missing early needBootstrap messages
            this.bootstrapWasmToWorklet();

            // Master gain node for mute control
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 1;
            workletNode.connect(this.masterGain);
            this.masterGain.connect(this.audioContext.destination);

            this.audioWorklet = workletNode;
            this.isInitialized = true;
            console.log(
                "AudioWorklet initialized at sampleRate",
                this.sampleRate,
            );
            // Periodic timebase sync (helps long sessions)
            try {
                if (this.timebaseTimer != null) {
                    clearInterval(this.timebaseTimer);
                    this.timebaseTimer = null;
                }
                this.timebaseTimer = window.setInterval(() => {
                    if (!this.audioWorklet || !this.audioContext) return;
                    const perfNowMs = performance.now();
                    const audioCurrentTimeSec = this.audioContext.currentTime;
                    try {
                        this.audioWorklet.port.postMessage({
                            type: "timebase",
                            perfNowMs,
                            audioCurrentTimeSec,
                        });
                    } catch {}
                }, 1000);
            } catch {}
            return true;
        } catch (error) {
            console.error("Failed to initialize audio:", error);
            return false;
        }
    }

    private flushGraphToWorklet() {
        if (!this.audioWorklet) return;
        this.audioWorklet.port.postMessage({ type: "clear" });
        for (const [nodeId, data] of this.audioNodes.entries()) {
            this.audioWorklet.port.postMessage({
                type: "updateNode",
                nodeId,
                data,
            });
        }
        this.audioWorklet.port.postMessage({
            type: "updateConnections",
            connections: this.nodeConnections,
        });
    }

    stopAudio() {
        try {
            if (this.audioWorklet) {
                try {
                    this.audioWorklet.port.postMessage({ type: "clear" });
                } catch {}
                this.audioWorklet.disconnect();
                this.audioWorklet = null;
            }
            // Abort recording if active
            if (this.recording && this.recording.mediaRecorder && this.recording.mediaRecorder.state !== 'inactive') {
                try { this.recording.mediaRecorder.stop(); } catch {}
            }
            if (this.audioContext) {
                this.audioContext.close();
                this.audioContext = null;
            }
            if (this.timebaseTimer != null) {
                try { clearInterval(this.timebaseTimer); } catch {}
                this.timebaseTimer = null;
            }
        } finally {
            this.isInitialized = false;
            this.wasmReady = false;
            this.recording = null;
        }
    }

    updateNode(nodeId: string, nodeData: AudioNodeData) {
        const clean = this.sanitizeForPostMessage(nodeData) as AudioNodeData;
        this.audioNodes.set(nodeId, clean);
        if (this.audioWorklet) {
            this.audioWorklet.port.postMessage({
                type: "updateNode",
                nodeId,
                data: clean,
            });
        }
    }

    removeNode(nodeId: string) {
        this.audioNodes.delete(nodeId);
        if (this.audioWorklet) {
            this.audioWorklet.port.postMessage({ type: "removeNode", nodeId });
        }
    }

    updateConnections(
        connections: Array<{
            from: string;
            to: string;
            fromOutput: string;
            toInput: string;
        }>,
    ) {
        this.nodeConnections = connections;
        if (this.audioWorklet) {
            this.audioWorklet.port.postMessage({
                type: "updateConnections",
                connections,
            });
        }
    }

    sendMIDI(
        sourceId: string,
        events: Array<{
            data: [number, number, number];
            atFrame?: number;
            atTimeMs?: number;
        }>,
    ) {
        if (!this.audioWorklet) return;
        // Sanitize events
        const cleanEvents = (Array.isArray(events) ? events : []).map((e) => ({
            data: [
                Number(e.data?.[0] || 0) & 0xff,
                Number(e.data?.[1] || 0) & 0x7f,
                Number(e.data?.[2] || 0) & 0x7f,
            ] as [number, number, number],
            atFrame:
                typeof e.atFrame === "number"
                    ? Math.max(0, Math.floor(e.atFrame))
                    : undefined,
            atTimeMs: typeof e.atTimeMs === "number" ? e.atTimeMs : undefined,
        }));
        this.audioWorklet.port.postMessage({
            type: "midi",
            sourceId,
            events: cleanEvents,
        });
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

            if (!glueRes.ok || !wasmRes.ok) {
                console.error("[AudioManager] WASM asset fetch failed", {
                    glueStatus: glueRes.status,
                    wasmStatus: wasmRes.status,
                });
                const sample = await glueRes.text().catch(() => "");
                if (sample.startsWith("<")) {
                    console.error(
                        "[AudioManager] Glue request returned HTML (likely 404) – did you commit public/audio-engine-wasm/* or run build:wasm?",
                    );
                }
                this.audioWorklet.port.postMessage({
                    type: "error",
                    message: `WASM assets missing (glue ${glueRes.status}, wasm ${wasmRes.status}). Ensure public/audio-engine-wasm is present in deployment.`,
                });
                return;
            }

            const glue = await glueRes.text();
            if (glue.trim().startsWith("<")) {
                console.error(
                    "[AudioManager] Received HTML instead of JS for glue file (probably 404).",
                );
                this.audioWorklet.port.postMessage({
                    type: "error",
                    message:
                        "Received HTML instead of wasm-bindgen glue (missing build?)",
                });
                return;
            }
            const wasm = await wasmRes.arrayBuffer();
            this.audioWorklet.port.postMessage({
                type: "bootstrapWasm",
                glue,
                wasm,
            });
        } catch (err) {
            console.error("Failed to bootstrap WASM into worklet:", err);
        }
    }

    // --- Transport API ---
    setBpm(next: number) {
        const v = Math.max(20, Math.min(300, Math.round(next)));
        this.bpm = v;
        if (this.audioWorklet) {
            this.audioWorklet.port.postMessage({ type: "setBpm", bpm: v });
        }
    }

    syncAllNextBeat() {
        if (this.audioWorklet) {
            this.audioWorklet.port.postMessage({ type: "syncAllNextBeat" });
        }
    }

    onBeat(cb: (beat: number, bpm: number) => void) {
        this.beatListeners.add(cb);
        return () => this.beatListeners.delete(cb);
    }

    onSequencerStep(cb: (nodeId: string, stepIndex: number) => void) {
        this.sequencerStepListeners.add(cb);
        return () => this.sequencerStepListeners.delete(cb);
    }

    onArpNote(cb: (nodeId: string, note: number) => void) {
        this.arpTickListeners.add(cb);
        return () => this.arpTickListeners.delete(cb);
    }

    setSequencerRate(nodeId: string, multiplier: number) {
        if (!this.audioWorklet) return;
        if (![0.25, 0.5, 1, 2, 4].includes(multiplier)) return;
        this.audioWorklet.port.postMessage({ type: "setSequencerRate", nodeId, multiplier });
    }

    setSequencerPlay(nodeId: string, play: boolean) {
        if (!this.audioWorklet) return;
        this.audioWorklet.port.postMessage({ type: "setSequencerPlay", nodeId, play: !!play });
    }

    setArpPlay(nodeId: string, play: boolean) {
        if (!this.audioWorklet) return;
        this.audioWorklet.port.postMessage({ type: 'setArpPlay', nodeId, play: !!play });
    }

    setArpRate(nodeId: string, multiplier: number) {
        if (!this.audioWorklet) return;
        if (![0.25,0.5,1,2,4].includes(multiplier)) return;
        this.audioWorklet.port.postMessage({ type: 'setArpRate', nodeId, multiplier });
    }

    panic() {
        if (!this.audioWorklet) return;
        this.audioWorklet.port.postMessage({ type: 'panic' });
    }

    getBpm() { return this.bpm; }

    // --- Recording API (Stereo master capture) ---
    startRecording(onStop?: (blob: Blob, durationSec: number) => void): boolean {
        if (!this.audioContext || !this.audioWorklet) return false;
        if (this.recording && this.isRecording()) return false;
        // Always use WAV path now.
        try {
            // Ensure worklet still connected to destination (in case prior modifications changed routing)
            if (this.audioWorklet.numberOfOutputs && this.audioContext.destination) {
                try { this.audioWorklet.connect(this.audioContext.destination); } catch {}
            }
        } catch {}
        const rec: typeof this.recording = { mediaRecorder: null, chunks: [], startTime: performance.now(), onStop, wav: { enabled: true, pcmL: [], pcmR: [] } };
        this.recording = rec;
        try { this.audioWorklet.port.postMessage({ type: 'startCapture' }); } catch {}
        return true;
    }

    stopRecording(): boolean {
        if (!this.recording) return false;
        // WAV finalize
        if (this.recording.wav && this.recording.wav.enabled) {
            try { this.audioWorklet?.port.postMessage({ type: 'stopCapture' }); } catch {}
            const { pcmL, pcmR } = this.recording.wav;
            if (!pcmL.length) return false;
            const totalSamples = pcmL.reduce((a,b)=>a + b.length, 0);
            const interleaved = new Float32Array(totalSamples * 2);
            let offset = 0;
            for (let i=0;i<pcmL.length;i++) {
                const L = pcmL[i]; const R = (pcmR[i] && pcmR[i].length === L.length) ? pcmR[i] : L;
                for (let j=0;j<L.length;j++) {
                    interleaved[offset++] = L[j];
                    interleaved[offset++] = R[j];
                }
            }
            const wavBuffer = this._encodeWav(interleaved, 2, this.sampleRate);
            const blob = new Blob([wavBuffer], { type: 'audio/wav' });
            const dur = (performance.now() - this.recording.startTime) / 1000;
            if (this.recording.onStop) { try { this.recording.onStop(blob, dur); } catch {} }
            // mark as finished so a new recording can start
            this.recording.wav.enabled = false;
            this.recording = null;
            return true;
        }
        return false;
    }

    private _encodeWav(interleaved: Float32Array, channels: number, sampleRate: number): ArrayBuffer {
        const bytesPerSample = 2; // 16-bit
        const blockAlign = channels * bytesPerSample;
        const byteRate = sampleRate * blockAlign;
    // dataSize not needed explicitly; size written directly below
        const buffer = new ArrayBuffer(44 + interleaved.length * bytesPerSample);
        const view = new DataView(buffer);
        let offset = 0;
        const writeString = (s: string) => { for (let i=0;i<s.length;i++) view.setUint8(offset++, s.charCodeAt(i)); };
        // RIFF header
        writeString('RIFF');
        view.setUint32(offset, 36 + interleaved.length * bytesPerSample, true); offset += 4;
        writeString('WAVE');
        // fmt chunk
        writeString('fmt ');
        view.setUint32(offset, 16, true); offset += 4; // PCM chunk size
        view.setUint16(offset, 1, true); offset += 2; // audio format PCM
        view.setUint16(offset, channels, true); offset += 2;
        view.setUint32(offset, sampleRate, true); offset += 4;
        view.setUint32(offset, byteRate, true); offset += 4;
        view.setUint16(offset, blockAlign, true); offset += 2;
        view.setUint16(offset, bytesPerSample * 8, true); offset += 2;
        // data chunk
        writeString('data');
        view.setUint32(offset, interleaved.length * bytesPerSample, true); offset += 4;
        // PCM samples
        for (let i=0;i<interleaved.length;i++) {
            let s = interleaved[i];
            s = Math.max(-1, Math.min(1, s));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            offset += 2;
        }
        return buffer;
    }

    isRecording(): boolean { return !!(this.recording && this.recording.wav && this.recording.wav.enabled); }

    // --- Preview mute API ---
    private updateMasterGainVolume() {
        if (!this.masterGain) return;
        const muted = this.userMuted || this.previewMuteDepth > 0;
        this.masterGain.gain.value = muted ? 0 : 1;
    }
    async muteForPreview() {
        this.previewMuteDepth++;
        this.updateMasterGainVolume();
    }
    async resumeFromPreview() {
        if (this.previewMuteDepth > 0) this.previewMuteDepth--;
        this.updateMasterGainVolume();
    }

    setUserMuted(muted: boolean) {
        this.userMuted = !!muted;
        this.updateMasterGainVolume();
    }
    isUserMuted() { return this.userMuted; }
}
