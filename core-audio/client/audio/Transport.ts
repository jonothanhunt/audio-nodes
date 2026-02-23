export class Transport {
    private bpm = 120;
    private beatListeners: Set<(beat: number, bpm: number) => void> = new Set();
    private sequencerStepListeners: Set<(nodeId: string, stepIndex: number) => void> = new Set();
    private arpTickListeners: Set<(nodeId: string, note: number) => void> = new Set();
    private worklet: AudioWorkletNode | null = null;

    setWorklet(worklet: AudioWorkletNode | null) {
        this.worklet = worklet;
    }

    handleWorkletMessage(msg: { type?: string;[k: string]: unknown }) {
        if (!msg) return;
        switch (msg.type) {
            case "beat": {
                const beat = Number(msg.beatIndex as number | string) || 0;
                const bpm = Number(msg.bpm as number | string) || this.bpm;
                this.bpm = bpm;
                this.beatListeners.forEach((cb) => { try { cb(beat, bpm); } catch { } });
                break;
            }
            case "sequencerStep": {
                const nid = String(msg.nodeId || "");
                const stepIndex = Number(msg.stepIndex as number | string) || 0;
                if (nid) {
                    this.sequencerStepListeners.forEach((cb) => { try { cb(nid, stepIndex); } catch { } });
                }
                break;
            }
            case "arpNote": {
                const nid = String(msg.nodeId || "");
                const note = Number(msg.note as number | string) || 0;
                if (nid) {
                    this.arpTickListeners.forEach((cb) => { try { cb(nid, note); } catch { } });
                }
                break;
            }
        }
    }

    setBpm(next: number) {
        const v = Math.max(20, Math.min(300, Math.round(next)));
        this.bpm = v;
        if (this.worklet) {
            this.worklet.port.postMessage({ type: "setBpm", bpm: v });
        }
    }

    getBpm() { return this.bpm; }

    syncAllNextBeat() {
        if (this.worklet) {
            this.worklet.port.postMessage({ type: "syncAllNextBeat" });
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
        if (!this.worklet) return;
        if (![0.25, 0.5, 1, 2, 4].includes(multiplier)) return;
        this.worklet.port.postMessage({ type: "setSequencerRate", nodeId, multiplier });
    }

    setSequencerPlay(nodeId: string, play: boolean) {
        if (!this.worklet) return;
        this.worklet.port.postMessage({ type: "setSequencerPlay", nodeId, play: !!play });
    }

    setArpPlay(nodeId: string, play: boolean) {
        if (!this.worklet) return;
        this.worklet.port.postMessage({ type: 'setArpPlay', nodeId, play: !!play });
    }

    setArpRate(nodeId: string, multiplier: number) {
        if (!this.worklet) return;
        if (![0.25, 0.5, 1, 2, 4].includes(multiplier)) return;
        this.worklet.port.postMessage({ type: 'setArpRate', nodeId, multiplier });
    }

    panic() {
        if (!this.worklet) return;
        this.worklet.port.postMessage({ type: 'panic' });
    }

    sendMIDI(
        sourceId: string,
        events: Array<{
            data: [number, number, number];
            atFrame?: number;
            atTimeMs?: number;
        }>,
    ) {
        if (!this.worklet) return;
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
        this.worklet.port.postMessage({
            type: "midi",
            sourceId,
            events: cleanEvents,
        });
    }
}
