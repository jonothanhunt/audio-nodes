import { describe, it, expect, beforeEach } from 'vitest';

// Minimal stub of the processor that exposes only _propagateValueNodes
// so we can test it in isolation without requiring a full AudioWorklet env.
function makeProcessor() {
    const p = {
        _nodes: new Map(),
        _paramConnections: [],
        _propagatedValues: null,
        _postedMessages: [],
        port: {
            postMessage(msg) { p._postedMessages.push(msg); },
        },
    };

    // Paste in the method under test (same logic, cannot import directly from worklet)
    p._propagateValueNodes = function () {
        if (!this._paramConnections || !this._paramConnections.length) return;
        const valueTargets = this._paramConnections.filter(m => {
            const n = this._nodes.get(m.to);
            return n && typeof n.type === 'string' && n.type.startsWith('value-');
        });
        if (!valueTargets.length) return;
        if (!this._propagatedValues) this._propagatedValues = new Map();
        for (let pass = 0; pass < 4; pass++) {
            let anyChanged = false;
            for (const m of valueTargets) {
                const srcNode = this._nodes.get(m.from);
                if (!srcNode) continue;
                const targetNode = this._nodes.get(m.to);
                if (!targetNode) continue;
                const outKey = m.fromOutput && m.fromOutput !== 'param-out' && m.fromOutput !== 'output'
                    ? m.fromOutput : 'value';
                const raw = srcNode[outKey];
                if (raw === undefined || raw === null) continue;
                const prevNodeVal = targetNode[m.targetParam];
                if (prevNodeVal !== raw) {
                    this._nodes.set(m.to, { ...targetNode, [m.targetParam]: raw });
                    anyChanged = true;
                }
                const cacheKey = `${m.from}:${m.to}:${m.targetParam}`;
                if (this._propagatedValues.get(cacheKey) !== raw) {
                    this._propagatedValues.set(cacheKey, raw);
                    try { this.port.postMessage({ type: 'modPreview', nodeId: m.to, data: { [m.targetParam]: raw } }); } catch { }
                }
            }
            if (!anyChanged) break;
        }
    };

    return p;
}

describe('_propagateValueNodes', () => {
    let p;
    beforeEach(() => { p = makeProcessor(); });

    it('does nothing when no param connections', () => {
        p._nodes.set('boolA', { type: 'value-bool', value: true });
        p._propagateValueNodes();
        expect(p._postedMessages).toHaveLength(0);
    });

    it('propagates Bool A → Bool B and posts modPreview', () => {
        p._nodes.set('boolA', { type: 'value-bool', value: true });
        p._nodes.set('boolB', { type: 'value-bool', value: false });
        p._paramConnections = [{ from: 'boolA', to: 'boolB', fromOutput: 'param-out', targetParam: 'value' }];
        p._propagateValueNodes();
        expect(p._nodes.get('boolB').value).toBe(true);
        expect(p._postedMessages).toHaveLength(1);
        expect(p._postedMessages[0]).toMatchObject({ type: 'modPreview', nodeId: 'boolB', data: { value: true } });
    });

    it('propagates a 3-level chain: A → B → C', () => {
        p._nodes.set('a', { type: 'value-bool', value: true });
        p._nodes.set('b', { type: 'value-bool', value: false });
        p._nodes.set('c', { type: 'value-bool', value: false });
        p._paramConnections = [
            { from: 'a', to: 'b', fromOutput: 'param-out', targetParam: 'value' },
            { from: 'b', to: 'c', fromOutput: 'param-out', targetParam: 'value' },
        ];
        p._propagateValueNodes();
        expect(p._nodes.get('b').value).toBe(true);
        expect(p._nodes.get('c').value).toBe(true);
    });

    it('does NOT re-post modPreview if value unchanged (cache optimization)', () => {
        p._nodes.set('a', { type: 'value-bool', value: true });
        p._nodes.set('b', { type: 'value-bool', value: false });
        p._paramConnections = [{ from: 'a', to: 'b', fromOutput: 'param-out', targetParam: 'value' }];
        p._propagateValueNodes(); // first call — posts
        p._postedMessages = [];
        p._propagateValueNodes(); // second call — same value, cache hit
        expect(p._postedMessages).toHaveLength(0);
    });

    it('DOES re-post when value changes (catches the React-reset bug)', () => {
        p._nodes.set('a', { type: 'value-bool', value: true });
        p._nodes.set('b', { type: 'value-bool', value: false });
        p._paramConnections = [{ from: 'a', to: 'b', fromOutput: 'param-out', targetParam: 'value' }];
        p._propagateValueNodes(); // a=true → b=true, cache=true
        p._postedMessages = [];

        // Simulate React node-sync resetting b to false in _nodes
        p._nodes.set('b', { type: 'value-bool', value: false });
        // Simulate a toggle (a flips to false)
        p._nodes.set('a', { type: 'value-bool', value: false });

        p._propagateValueNodes(); // a=false, b=false (from React reset) — _nodes match but cache=true≠false
        expect(p._postedMessages).toHaveLength(1);
        expect(p._postedMessages[0].data.value).toBe(false);
    });

    it('does not propagate to non-value nodes (only targets value-*)', () => {
        p._nodes.set('a', { type: 'value-bool', value: true });
        p._nodes.set('seq', { type: 'sequencer', playing: false });
        p._paramConnections = [{ from: 'a', to: 'seq', fromOutput: 'param-out', targetParam: 'playing' }];
        p._propagateValueNodes();
        // sequencer is not a value- node, so no propagation
        expect(p._nodes.get('seq').playing).toBe(false);
        expect(p._postedMessages).toHaveLength(0);
    });
});
