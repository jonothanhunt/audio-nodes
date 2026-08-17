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

    /** Last payload posted per node / for the connection list, to suppress no-op posts. */
    private nodeSignatures: Map<string, string> = new Map();
    private connectionsSignature: string | null = null;

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
        // The worklet is about to be reset, so its view of every node is gone. Drop the
        // dedupe signatures too, otherwise the re-send below would be suppressed.
        this.nodeSignatures.clear();
        this.connectionsSignature = null;
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

        // Second line of defence behind useNodeSync's own diffing: a redundant post costs a
        // structured clone on the way out and a render-plan rebuild on the way in, so drop
        // it when nothing the engine reads has actually changed.
        const signature = JSON.stringify(clean);
        if (this.nodeSignatures.get(nodeId) === signature) return;
        this.nodeSignatures.set(nodeId, signature);

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
        this.nodeSignatures.delete(nodeId);
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
        const signature = JSON.stringify(connections);
        if (this.connectionsSignature === signature) return;
        this.connectionsSignature = signature;

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
        this.nodeSignatures.clear();
        this.connectionsSignature = null;
        if (this.worklet) {
            try { this.worklet.port.postMessage({ type: "clear" }); } catch { }
        }
    }
}
