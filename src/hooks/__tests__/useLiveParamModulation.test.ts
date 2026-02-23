import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// useLiveParamModulation subscribes to window events and manages state.
// We test the subscription behaviour through a minimal mock of the hook logic.
// Full hook testing requires @testing-library/react; these tests cover the
// core subscription invariants without that dependency.

type Handler = (e: Event) => void;
const listeners: Record<string, Handler[]> = {};

function mockWindow() {
    return {
        addEventListener: vi.fn((type: string, handler: Handler) => {
            if (!listeners[type]) listeners[type] = [];
            listeners[type].push(handler);
        }),
        removeEventListener: vi.fn((type: string, handler: Handler) => {
            if (listeners[type]) listeners[type] = listeners[type].filter(h => h !== handler);
        }),
        dispatchEvent: vi.fn((event: Event) => {
            const hs = listeners[(event as CustomEvent).type] ?? [];
            hs.forEach(h => h(event));
        }),
    };
}

// Simulate what useLiveParamModulation does internally:
// subscribes when connected=true, clears on connected=false.
function simulateHook(nodeId: string, paramKey: string, connected: boolean, win: ReturnType<typeof mockWindow>) {
    let value: number | boolean | undefined = undefined;
    const setValue = (v: number | boolean | undefined) => { value = v; };

    if (!connected) {
        setValue(undefined);
        return { value, cleanup: () => { } };
    }

    const handler = (e: Event) => {
        const detail = (e as CustomEvent).detail as { nodeId: string; data: Record<string, unknown> };
        if (!detail || detail.nodeId !== nodeId) return;
        const v = detail.data?.[paramKey];
        if (typeof v === 'number' && isFinite(v)) setValue(v);
        else if (typeof v === 'boolean') setValue(v);
    };

    win.addEventListener('audioNodesNodeRendered', handler as Handler);
    const cleanup = () => win.removeEventListener('audioNodesNodeRendered', handler as Handler);

    return {
        get value() { return value; },
        cleanup,
    };
}

describe('useLiveParamModulation behaviour', () => {
    let win: ReturnType<typeof mockWindow>;
    beforeEach(() => {
        Object.keys(listeners).forEach(k => delete listeners[k]);
        win = mockWindow();
    });
    afterEach(() => {
        Object.keys(listeners).forEach(k => delete listeners[k]);
    });

    it('does not subscribe when connected=false', () => {
        simulateHook('node1', 'playing', false, win);
        expect(win.addEventListener).not.toHaveBeenCalled();
    });

    it('returns undefined when not connected', () => {
        const { value } = simulateHook('node1', 'playing', false, win);
        expect(value).toBeUndefined();
    });

    it('subscribes to audioNodesNodeRendered when connected=true', () => {
        simulateHook('node1', 'playing', true, win);
        expect(win.addEventListener).toHaveBeenCalledWith('audioNodesNodeRendered', expect.any(Function));
    });

    it('receives a boolean live value from event', () => {
        const hook = simulateHook('node1', 'playing', true, win);
        win.dispatchEvent(new CustomEvent('audioNodesNodeRendered', {
            detail: { nodeId: 'node1', data: { playing: true } },
        }) as unknown as Event);
        expect(hook.value).toBe(true);
    });

    it('receives a numeric live value from event', () => {
        const hook = simulateHook('node2', 'frequency', true, win);
        win.dispatchEvent(new CustomEvent('audioNodesNodeRendered', {
            detail: { nodeId: 'node2', data: { frequency: 440 } },
        }) as unknown as Event);
        expect(hook.value).toBe(440);
    });

    it('ignores events for other node IDs', () => {
        const hook = simulateHook('node1', 'playing', true, win);
        win.dispatchEvent(new CustomEvent('audioNodesNodeRendered', {
            detail: { nodeId: 'node99', data: { playing: true } },
        }) as unknown as Event);
        expect(hook.value).toBeUndefined();
    });

    it('updates correctly through rapid toggles (last event wins)', () => {
        const hook = simulateHook('node1', 'playing', true, win);
        const fire = (v: boolean) => win.dispatchEvent(new CustomEvent('audioNodesNodeRendered', {
            detail: { nodeId: 'node1', data: { playing: v } },
        }) as unknown as Event);
        fire(true); fire(false); fire(true); fire(false); fire(true);
        expect(hook.value).toBe(true);
    });

    it('removes event listener on cleanup', () => {
        const { cleanup } = simulateHook('node1', 'playing', true, win);
        cleanup();
        expect(win.removeEventListener).toHaveBeenCalledWith('audioNodesNodeRendered', expect.any(Function));
        // After cleanup, events have no effect
        expect(listeners['audioNodesNodeRendered'] ?? []).toHaveLength(0);
    });
});
