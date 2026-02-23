import { AudioNodeData } from './types';

export class GraphSync {
    private audioNodes: Map<string, AudioNodeData> = new Map();
    private nodeConnections: Array<{
        from: string;
        to: string;
        fromOutput: string;
        toInput: string;
    }> = [];
    private worklet: AudioWorkletNode | null = null;

    setWorklet(worklet: AudioWorkletNode | null) {
        this.worklet = worklet;
    }

    private sanitizeForPostMessage(
        value: unknown,
        seen: WeakSet<object> = new WeakSet<object>(),
    ): unknown {
        const t = typeof value;
        if (value === null || t === "number" || t === "string" || t === "boolean") return value;
        if (t === "undefined" || t === "function" || t === "symbol") return undefined;

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
            if (seen.has(obj as object)) return undefined;
            seen.add(obj as object);
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

    flushGraphToWorklet() {
        if (!this.worklet) return;
        this.worklet.port.postMessage({ type: "clear" });
        for (const [nodeId, data] of this.audioNodes.entries()) {
            this.worklet.port.postMessage({
                type: "updateNode",
                nodeId,
                data,
            });
        }
        this.worklet.port.postMessage({
            type: "updateConnections",
            connections: this.nodeConnections,
        });
    }

    updateNode(nodeId: string, nodeData: AudioNodeData) {
        const clean = this.sanitizeForPostMessage(nodeData) as AudioNodeData;
        this.audioNodes.set(nodeId, clean);
        if (this.worklet) {
            this.worklet.port.postMessage({
                type: "updateNode",
                nodeId,
                data: clean,
            });
        }
    }

    removeNode(nodeId: string) {
        this.audioNodes.delete(nodeId);
        if (this.worklet) {
            this.worklet.port.postMessage({ type: "removeNode", nodeId });
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
        if (this.worklet) {
            this.worklet.port.postMessage({
                type: "updateConnections",
                connections,
            });
        }
    }

    clear() {
        this.audioNodes.clear();
        this.nodeConnections = [];
        if (this.worklet) {
            try { this.worklet.port.postMessage({ type: "clear" }); } catch { }
        }
    }
}
