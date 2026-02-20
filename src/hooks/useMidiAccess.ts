import { useEffect } from 'react';
import { Node } from 'reactflow';
import { parseMidiMessage } from '../lib/midi/MidiParser';

export interface MidiNodeData {
    deviceId?: string;
    devices?: Array<{ id: string; name: string }>;
    status?: string;
    activeNotes?: number[];
    channel?: number | "all";
    error?: string;
    [k: string]: unknown;
}

export function useMidiAccess(
    nodesRef: React.MutableRefObject<Node[]>,
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
    sendMIDI: (sourceId: string, events: Array<{ data: [number, number, number]; atTimeMs?: number }>) => void
) {
    useEffect(() => {
        let mounted = true;
        const STATUS_PREFIX = "[MIDI]";
        const activeNotesRef = new Map<string, Set<number>>();

        const setStatusAll = (status: string) => {
            setNodes(nds => nds.map(n => n.type === "midi-input" ? { ...n, data: { ...n.data, status } } : n));
        };
        const setErrorAll = (error: string) => {
            setNodes(nds => nds.map(n => n.type === "midi-input" ? { ...n, data: { ...n.data, error } } : n));
        };

        if (typeof window === "undefined") return;
        const secure = window.isSecureContext;
        if (!secure) {
            setStatusAll("insecure-context");
            return;
        }
        if (!("requestMIDIAccess" in navigator)) {
            setStatusAll("unsupported");
            return;
        }

        const getInputs = (access: MIDIAccess): MIDIInput[] => {
            try { return Array.from(access.inputs.values()); } catch { return []; }
        };

        const publishDevices = (access: MIDIAccess) => {
            const inputs = getInputs(access);
            const list: Array<{ id: string; name: string }> = [];
            const seen = new Set<string>();
            inputs.forEach((inp, idx) => {
                const rawId = (inp.id || "").trim();
                const rawName = (inp.name || rawId || "").trim();
                const id = rawId || rawName || `device-${idx}`;
                const name = rawName || rawId || id;
                const key = id + "::" + name;
                if (seen.has(key)) return;
                seen.add(key);
                list.push({ id, name });
            });
            list.sort((a, b) => a.name.localeCompare(b.name));
            setNodes((prev) => {
                const updated = prev.map((n) => {
                    if (n.type !== "midi-input") return n;
                    const existing = n.data as unknown as MidiNodeData;
                    const currentId = existing.deviceId || "";
                    const nextId = currentId && list.some((d) => d.id === currentId) ? currentId : "";
                    const hasActive = Array.isArray(existing.activeNotes) && existing.activeNotes.length > 0;
                    const newData: MidiNodeData = { ...existing, devices: list, deviceId: nextId, status: hasActive ? existing.status : "listening" };
                    return { ...n, data: newData as unknown as Record<string, unknown> };
                });
                return updated;
            });
            if (list.length === 0) setStatusAll("no-devices");
            else setStatusAll("listening");
        };

        let accessRef: MIDIAccess | null = null;
        let requesting = false;

        const attachHandlers = (access: MIDIAccess) => {
            if (!mounted) return;
            setNodes(prev => prev.map(n => n.type === "midi-input" ? { ...n, data: { ...n.data, error: undefined } } : n));
            publishDevices(access);

            const updateInputHandlers = () => {
                if (!mounted) return;
                publishDevices(access);
                const inputs = getInputs(access);
                for (const input of inputs) {
                    input.onmidimessage = (e: MIDIMessageEvent) => {
                        const bytes = e.data;
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
                        const parsed = parseMidiMessage(bytes as any);
                        if (!parsed) return;
                        const { status, label, cmd, note, velocity, channel } = parsed;

                        const nodesSnap = nodesRef.current;
                        for (const n of nodesSnap) {
                            if (n.type !== "midi-input") continue;
                            const nd = (n.data as unknown as MidiNodeData) || {};
                            const devFilter = (nd.deviceId || "").trim();
                            const inName = (input.name || "").trim();

                            if (devFilter && devFilter !== (input.id || "") && devFilter !== inName) continue;
                            if (nd.channel && nd.channel !== "all" && channel !== null && nd.channel !== channel) continue;

                            if (cmd === 0x90 || cmd === 0x80) {
                                let set = activeNotesRef.get(n.id);
                                if (!set) {
                                    set = new Set();
                                    activeNotesRef.set(n.id, set);
                                }
                                if (cmd === 0x90 && velocity > 0) set.add(note);
                                else set.delete(note);
                            }

                            const activeSet = activeNotesRef.get(n.id) || new Set<number>();
                            const notesArr = Array.from(activeSet.values());
                            setNodes((prev) => {
                                return prev.map((p) => {
                                    if (p.id !== n.id) return p;
                                    const existing = p.data as unknown as MidiNodeData;
                                    const statusStrBase = notesArr.length > 0 ? [...notesArr].sort((a, b) => a - b).join(",") : label;
                                    const statusStr = notesArr.length === 0 && (label === "NoteOff" || label === "NoteOn") ? "listening" : statusStrBase;
                                    const newData: MidiNodeData = { ...existing, status: statusStr, activeNotes: notesArr };
                                    return { ...p, data: newData as unknown as Record<string, unknown> };
                                });
                            });

                            sendMIDI(n.id, [{
                                data: [status, bytes?.[1] ?? 0, bytes?.[2] ?? 0] as [number, number, number],
                                atTimeMs: e.timeStamp,
                            }]);
                        }
                    };
                }
            };
            updateInputHandlers();

            try {
                const hasAdd = (access as unknown as { addEventListener?: (t: string, cb: () => void) => void }).addEventListener;
                if (typeof hasAdd === "function") {
                    hasAdd.call(access, "statechange", updateInputHandlers);
                } else if (typeof access.onstatechange !== "undefined") {
                    access.onstatechange = updateInputHandlers;
                }
            } catch { /* ignore */ }
        };

        const requestMIDI = async () => {
            if (requesting || accessRef || !mounted) return;
            requesting = true;
            setStatusAll("requesting");
            try {
                const requestFn = navigator.requestMIDIAccess?.bind(navigator);
                if (typeof requestFn !== "function") {
                    setStatusAll("unsupported");
                    return;
                }
                const access = await requestFn({ sysex: false });
                if (!mounted) return;
                accessRef = access;
                attachHandlers(access);
            } catch (err: unknown) {
                const name = (err as { name?: string })?.name || "Error";
                const message = (err as { message?: string })?.message || "";
                console.warn(STATUS_PREFIX, "requestMIDIAccess failed", name, message);
                setStatusAll(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "TypeError" ? "unsupported" : "error");
                setErrorAll(name === "TypeError" ? "TypeError (maybe blocked flag or experimental feature disabled)" : name);
            } finally {
                requesting = false;
            }
        };

        const onRetry = () => { void requestMIDI(); };
        window.addEventListener("audioNodesRetryMIDI", onRetry);
        void requestMIDI();

        return () => {
            mounted = false;
            window.removeEventListener("audioNodesRetryMIDI", onRetry);
        };
    }, [sendMIDI, setNodes, nodesRef]);
}
