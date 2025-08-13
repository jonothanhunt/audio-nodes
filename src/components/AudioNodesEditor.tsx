"use client";

import React, { useCallback } from "react";
import ReactFlow, {
    MiniMap,
    Background,
    BackgroundVariant,
    Node,
    Edge,
    ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";

import NodeLibrary from "@/components/NodeLibrary";
import OscillatorNode from "@/components/nodes/OscillatorNode";
import ReverbNode from "@/components/nodes/ReverbNode";
import SpeakerNode from "@/components/nodes/SpeakerNode";
import SequencerNode from "@/components/nodes/SequencerNode";
import SynthesizerNode from "./nodes/SynthesizerNode";
import MidiInputNode from "@/components/nodes/MidiInputNode";
import SaveLoadPanel from "@/components/SaveLoadPanel";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { getDefaultNodeData } from "@/lib/nodes";
import { useProjectPersistence } from "@/hooks/useProjectPersistence";
import { useGraph } from "@/hooks/useGraph";
import MidiTransposeNode from "@/components/nodes/MidiTransposeNode";
import GradientEdge from "@/components/edges/GradientEdge";
import { getNodeMeta } from "@/lib/nodeRegistry";
import { getHandleRole } from "@/lib/handles";
import type { OnConnectStartParams } from "reactflow";
import ValueBoolNode from "./nodes/ValueBoolNode";
import ValueNumberNode from "./nodes/ValueNumberNode";
import ValueStringNode from "./nodes/ValueStringNode";
import ValueTextNode from "./nodes/ValueTextNode";
import ValueSelectNode from "./nodes/ValueSelectNode";

// Custom node registry
const nodeTypes = {
    oscillator: OscillatorNode,
    reverb: ReverbNode,
    speaker: SpeakerNode,
    sequencer: SequencerNode,
    synth: SynthesizerNode,
    "midi-input": MidiInputNode,
    "midi-transpose": MidiTransposeNode,
    "value-bool": ValueBoolNode,
    "value-number": ValueNumberNode,
    "value-string": ValueStringNode, // legacy
    "value-text": ValueTextNode,
    "value-select": ValueSelectNode,
};

export default function AudioNodesEditor() {
    const {
        nodes,
        setNodes,
        onNodesChange,
        edges,
        setEdges,
        onEdgesChange,
        onConnect,
        isValidConnection,
        generateNodeId,
    } = useGraph();
    const { audioManager, audioInitialized, initializeAudio, sendMIDI } =
        useAudioEngine();
    const rfInstanceRef = React.useRef<ReactFlowInstance | null>(null);
    const [connectingColor, setConnectingColor] = React.useState<string | null>(
        null
    );
    const prevNodeIdsRef = React.useRef<Set<string>>(new Set());
    const clipboardRef = React.useRef<{ nodes: Node[]; edges: Edge[] } | null>(
        null
    );
    const pasteBumpRef = React.useRef<number>(0);
    // Stable refs for current nodes/edges to avoid stale closures in callbacks
    const nodesRef = React.useRef(nodes);
    const edgesRef = React.useRef(edges);
    React.useEffect(() => {
        nodesRef.current = nodes;
    }, [nodes]);
    React.useEffect(() => {
        edgesRef.current = edges;
    }, [edges]);

    const handleConnectStart = useCallback(
        (_: unknown, params: OnConnectStartParams) => {
            const nid = params?.nodeId;
            if (!nid) {
                setConnectingColor(null);
                return;
            }
            const node = nodes.find((n) => n.id === nid);
            setConnectingColor(
                node ? getNodeMeta(node.type).accentColor : null
            );
        },
        [nodes]
    );
    const handleConnectEnd = useCallback(() => {
        setConnectingColor(null);
    }, []);

    // Helper: for a nodeId/paramKey, determine if there is any incoming param-edge to that key
    const isParamConnected = useCallback((nodeId: string, paramKey: string) => {
        return edgesRef.current.some(
            (e) =>
                e.target === nodeId &&
                (e.targetHandle || "") === paramKey &&
                // source must be a param-out
                true
        );
    }, []);

    // MIDI emit (Sequencer etc.)
    const handleEmitMidi = useCallback(
        (
            sourceId: string,
            events: Array<{
                data: [number, number, number];
                atFrame?: number;
                atTimeMs?: number;
            }>
        ) => {
            sendMIDI(sourceId, events);
        },
        [sendMIDI]
    );

    // Parameter change
    const handleParameterChange = useCallback(
        (
            nodeId: string,
            parameter: string,
            value: string | number | boolean
        ) => {
            setNodes((prev) => {
                // 1) Update the source node's data
                const updated = prev.map((node) => {
                    if (node.id !== nodeId) return node;
                    const newNode = {
                        ...node,
                        data: { ...node.data, [parameter]: value },
                    };
                    // sync to audio engine
                    audioManager.updateNode(nodeId, {
                        type: node.type || "unknown",
                        ...newNode.data,
                    });
                    return newNode;
                });

                // 2) If this node has param-out connections, broadcast to targets
                const source = updated.find((n) => n.id === nodeId);
                if (!source) return updated;
                const sourceType = source.type || "unknown";
                const sourceValue = (source.data as Record<string, unknown>)[
                    "value"
                ] as unknown;

                // Only broadcast for Value nodes (bool/number/string)
                const isValueNode = (sourceType || "").startsWith("value-");
                if (!isValueNode) return updated;

                const outHandle = "output"; // HandleLayer default
                const outgoing = edgesRef.current.filter(
                    (e) =>
                        e.source === nodeId &&
                        (e.sourceHandle || "output") === outHandle
                );
                if (!outgoing.length) return updated;

                let changedAny = false;
                let next = updated;
                for (const e of outgoing) {
                    const idx = next.findIndex((n) => n.id === e.target);
                    const target = idx >= 0 ? next[idx] : undefined;
                    const targetKey = e.targetHandle || "";
                    if (!target || !targetKey) continue;
                    const cur = (target.data as Record<string, unknown>)[
                        targetKey
                    ];
                    let v = sourceValue as
                        | string
                        | number
                        | boolean
                        | undefined;
                    if (v === undefined) v = value as string | number | boolean;
                    if (v === undefined) continue;
                    if (cur === v) continue;
                    // create new data object to ensure React Flow detects change
                    const newData = {
                        ...(target.data as Record<string, unknown>),
                        [targetKey]: v,
                    } as unknown as typeof target.data;
                    const newNode = { ...target, data: newData };
                    // replace in array (copy-on-write once)
                    if (next === updated)
                        next = updated.map((n, i) => (i === idx ? newNode : n));
                    else next[idx] = newNode;
                    // sync to audio engine
                    audioManager.updateNode(target.id, {
                        type: target.type || "unknown",
                        ...(newData as unknown as Record<string, unknown>),
                    });
                    changedAny = true;
                }
                return changedAny ? next : updated;
            });
        },
        [setNodes, audioManager]
    );

    // Sync nodes to worklet (updates and removals)
    React.useEffect(() => {
        // compute removals
        const currentIds = new Set(nodes.map((n) => n.id));
        const prevIds = prevNodeIdsRef.current;
        for (const id of prevIds) {
            if (!currentIds.has(id)) {
                try {
                    audioManager.removeNode(id);
                } catch {}
            }
        }
        // push updates
        nodes.forEach((node) => {
            if (node.data && node.type) {
                audioManager.updateNode(node.id, {
                    type: node.type,
                    ...node.data,
                });
            }
        });
        prevNodeIdsRef.current = currentIds;
    }, [nodes, audioManager]);

    // Sync connections
    React.useEffect(() => {
        const connections = edges.map((edge) => ({
            from: edge.source,
            to: edge.target,
            fromOutput: edge.sourceHandle || "output",
            toInput: edge.targetHandle || "input",
        }));
        audioManager.updateConnections(connections);
    }, [edges, audioManager]);

    // Maintain a map of connected param-in handles per node for reliable UI disabling
    React.useEffect(() => {
        // Build target->set(paramKeys) for param-in edges only
        const map = new Map<string, Set<string>>();
        for (const e of edgesRef.current) {
            const source = nodesRef.current.find((n) => n.id === e.source);
            const target = nodesRef.current.find((n) => n.id === e.target);
            const fromRole = getHandleRole(
                source?.type,
                e.sourceHandle || undefined
            );
            const toRole = getHandleRole(
                target?.type,
                e.targetHandle || undefined
            );
            if (fromRole !== "param-out" || toRole !== "param-in") continue;
            const key = e.targetHandle || "";
            if (!key) continue;
            let set = map.get(e.target);
            if (!set) {
                set = new Set<string>();
                map.set(e.target, set);
            }
            set.add(key);
        }
        // Update nodes' data._connectedParams when changed
        setNodes((prev) =>
            prev.map((n) => {
                const set = map.get(n.id) || new Set<string>();
                const nextArr = Array.from(set.values()).sort();
                const dataRec =
                    (n.data as unknown as Record<string, unknown>) || {};
                const prevRaw = dataRec["_connectedParams"] as unknown;
                const prevArr = Array.isArray(prevRaw)
                    ? ([...prevRaw].sort() as string[])
                    : [];
                const equal =
                    nextArr.length === prevArr.length &&
                    nextArr.every((v, i) => v === prevArr[i]);
                if (equal) return n;
                const newData = {
                    ...(n.data as unknown as Record<string, unknown>),
                    _connectedParams: nextArr,
                } as unknown as typeof n.data;
                return { ...n, data: newData };
            })
        );
    }, [setNodes, edges]);

    // On new param connections, initialize target param with source value so disabled inputs show incoming data
    React.useEffect(() => {
        if (!edges.length) return;
        setNodes((prev) => {
            // Build updates for targets based on current edges
            const updates = new Map<string, Record<string, unknown>>();
            for (const e of edges) {
                const source = prev.find((n) => n.id === e.source);
                const target = prev.find((n) => n.id === e.target);
                if (!source || !target) continue;
                const fromRole = getHandleRole(
                    source.type,
                    e.sourceHandle || undefined
                );
                const toRole = getHandleRole(
                    target.type,
                    e.targetHandle || undefined
                );
                if (fromRole !== "param-out" || toRole !== "param-in") continue;
                const sourceType = source.type || "";
                if (!sourceType.startsWith("value-")) continue;
                const key = e.targetHandle || "";
                if (!key) continue;
                const sourceVal = (
                    source.data as unknown as Record<string, unknown>
                )["value"] as unknown;
                if (typeof sourceVal === "undefined") continue;
                const cur = (target.data as unknown as Record<string, unknown>)[
                    key
                ];
                if (cur === sourceVal) continue;
                const entry = updates.get(target.id) || {};
                (entry as Record<string, unknown>)[key] = sourceVal as
                    | string
                    | number
                    | boolean;
                updates.set(target.id, entry);
            }
            if (updates.size === 0) return prev;
            const next = prev.map((n) => {
                const up = updates.get(n.id);
                if (!up) return n;
                const mergedData = {
                    ...(n.data as unknown as Record<string, unknown>),
                    ...up,
                } as unknown as typeof n.data;
                const newNode = {
                    ...n,
                    data: mergedData,
                };
                audioManager.updateNode(newNode.id, {
                    type: newNode.type || "unknown",
                    ...(newNode.data as unknown as Record<string, unknown>),
                });
                return newNode;
            });
            return next;
        });
    }, [edges, setNodes, audioManager]);

    // Attach handlers
    React.useEffect(() => {
        setNodes((nds) =>
            nds.map((node) => ({
                ...node,
                data: {
                    ...node.data,
                    onParameterChange: handleParameterChange,
                    onEmitMidi: handleEmitMidi,
                    isParamConnected: (key: string) =>
                        isParamConnected(node.id, key),
                },
            }))
        );
    }, [handleParameterChange, handleEmitMidi, isParamConnected, setNodes]);

    // Reattach for persistence
    const reattachHandlers = useCallback(
        (
            data: Record<string, unknown> | undefined
        ): Record<string, unknown> => ({
            ...(data || {}),
            onParameterChange: handleParameterChange,
            onEmitMidi: handleEmitMidi,
        }),
        [handleParameterChange, handleEmitMidi]
    );

    const {
        handleSaveClick,
        handleLoadFromObject,
        loadFromLocalStorage,
        handleLoadDefault,
    } = useProjectPersistence(
        nodes,
        edges,
        setNodes,
        setEdges,
        rfInstanceRef,
        reattachHandlers
    );

    // Autoload project
    const didBootRef = React.useRef(false);
    React.useEffect(() => {
        if (didBootRef.current) return;
        didBootRef.current = true;
        const boot = async () => {
            const ok = loadFromLocalStorage();
            if (ok) return;
            const candidates = [
                "/projects/default-project.json",
                "/default-project.json",
            ];
            for (const url of candidates) {
                try {
                    const res = await fetch(`${url}?v=${Date.now()}`);
                    if (!res.ok) continue;
                    const json = await res.json();
                    handleLoadFromObject(json as unknown);
                    break;
                } catch {}
            }
        };
        void boot();
        // intentionally run only once
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Add new node
    const onAddNode = useCallback(
        (type: string) => {
            const inst = rfInstanceRef.current;
            // Place in viewport center
            let pos = { x: 0, y: 0 };
            if (inst) {
                const container =
                    (inst as unknown as { wrapper?: HTMLDivElement }).wrapper ||
                    (document.querySelector(
                        ".react-flow"
                    ) as HTMLDivElement | null);
                const rect = container?.getBoundingClientRect();
                const cx = rect
                    ? rect.left + rect.width / 2
                    : window.innerWidth / 2;
                const cy = rect
                    ? rect.top + rect.height / 2
                    : window.innerHeight / 2;
                const screenToFlow = (
                    inst as unknown as {
                        screenToFlowPosition?: (p: {
                            x: number;
                            y: number;
                        }) => { x: number; y: number };
                    }
                ).screenToFlowPosition;
                if (typeof screenToFlow === "function")
                    pos = screenToFlow({ x: cx, y: cy });
                else pos = inst.project({ x: cx, y: cy });
            }
            const newNode: Node = {
                id: generateNodeId(),
                type,
                position: pos,
                data: getDefaultNodeData(
                    type,
                    handleParameterChange,
                    handleEmitMidi
                ),
                selected: true,
            };
            setNodes((nds) => {
                // Clear previous selection and select the new node
                return [
                    ...nds.map((n) => ({ ...n, selected: false })),
                    newNode,
                ];
            });
        },
        [generateNodeId, setNodes, handleParameterChange, handleEmitMidi]
    );

    // Helpers for selection and geometry
    const getSelectedGraph = useCallback(() => {
        const selectedNodes = nodesRef.current.filter((n) => n.selected);
        const selectedIds = new Set(selectedNodes.map((n) => n.id));
        const selectedEdges = edgesRef.current.filter(
            (e) => selectedIds.has(e.source) && selectedIds.has(e.target)
        );
        return { selectedNodes, selectedEdges };
    }, []);

    const getViewportCenterFlow = useCallback(() => {
        const inst = rfInstanceRef.current;
        if (!inst) return { x: 0, y: 0 };
        const container =
            (inst as unknown as { wrapper?: HTMLDivElement }).wrapper ||
            (document.querySelector(".react-flow") as HTMLDivElement | null);
        const rect = container?.getBoundingClientRect();
        const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
        const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
        const screenToFlow = (
            inst as unknown as {
                screenToFlowPosition?: (p: { x: number; y: number }) => {
                    x: number;
                    y: number;
                };
            }
        ).screenToFlowPosition;
        if (typeof screenToFlow === "function")
            return screenToFlow({ x: cx, y: cy });
        return inst.project({ x: cx, y: cy });
    }, []);

    const getSelectionCentroid = (nodesList: Node[]) => {
        if (!nodesList.length) return { x: 0, y: 0 };
        const sx = nodesList.reduce((acc, n) => acc + (n.position?.x || 0), 0);
        const sy = nodesList.reduce((acc, n) => acc + (n.position?.y || 0), 0);
        return { x: sx / nodesList.length, y: sy / nodesList.length };
    };

    const duplicateGraph = useCallback(
        (
            nodesToCopy: Node[],
            edgesToCopy: Edge[],
            centerInViewport: boolean
        ) => {
            if (!nodesToCopy.length) return;
            const idMap = new Map<string, string>();
            nodesToCopy.forEach((n) => idMap.set(n.id, generateNodeId()));
            const centerTarget = centerInViewport
                ? getViewportCenterFlow()
                : null;
            const centroid = getSelectionCentroid(nodesToCopy);
            const bump = centerInViewport
                ? 0
                : ((pasteBumpRef.current = (pasteBumpRef.current + 1) % 5),
                  24 + 6 * pasteBumpRef.current);
            const newNodes: Node[] = nodesToCopy.map((n) => {
                const delta = {
                    x: (n.position?.x || 0) - centroid.x,
                    y: (n.position?.y || 0) - centroid.y,
                };
                const base =
                    centerInViewport && centerTarget
                        ? {
                              x: centerTarget.x + delta.x,
                              y: centerTarget.y + delta.y,
                          }
                        : {
                              x: (n.position?.x || 0) + bump,
                              y: (n.position?.y || 0) + bump,
                          };
                const clonedData = {
                    ...(n.data as unknown as Record<string, unknown>),
                } as unknown as Node["data"];
                return {
                    ...n,
                    id: idMap.get(n.id)!,
                    position: base,
                    selected: true,
                    data: clonedData,
                } as Node;
            });
            const newEdges: Edge[] = edgesToCopy
                .map((e) => {
                    const s = idMap.get(e.source);
                    const t = idMap.get(e.target);
                    if (!s || !t) return null;
                    return {
                        ...e,
                        id: `${s}-${t}-${e.sourceHandle || ""}-${
                            e.targetHandle || ""
                        }-${Math.random().toString(36).slice(2, 8)}`,
                        source: s,
                        target: t,
                    } as Edge;
                })
                .filter(Boolean) as Edge[];
            setNodes((prev) => {
                const cleared = prev.map(
                    (n) => ({ ...(n as Node), selected: false } as Node)
                );
                return [...cleared, ...newNodes];
            });
            setEdges((prev) => [...prev, ...newEdges]);
        },
        [getViewportCenterFlow, generateNodeId, setNodes, setEdges]
    );

    const duplicateSelection = useCallback(
        (centerInViewport: boolean) => {
            const { selectedNodes, selectedEdges } = getSelectedGraph();
            duplicateGraph(selectedNodes, selectedEdges, centerInViewport);
        },
        [getSelectedGraph, duplicateGraph]
    );

    // Keyboard shortcuts: Copy, Paste, Duplicate
    React.useEffect(() => {
        const isEditableTarget = (el: EventTarget | null) => {
            const t = el as HTMLElement | null;
            if (!t) return false;
            const tag = (t.tagName || "").toLowerCase();
            if (["input", "textarea", "select"].includes(tag)) return true;
            if ((t as HTMLElement).isContentEditable) return true;
            return false;
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (isEditableTarget(e.target)) return;
            const meta = e.metaKey || e.ctrlKey;
            const key = e.key.toLowerCase();
            if (meta && key === "c") {
                const { selectedNodes, selectedEdges } = getSelectedGraph();
                if (!selectedNodes.length) return;
                clipboardRef.current = {
                    nodes: selectedNodes,
                    edges: selectedEdges,
                };
                // prevent default OS copy of DOM selection
                e.preventDefault();
            } else if (meta && key === "v") {
                if (clipboardRef.current) {
                    const { nodes: cn, edges: ce } = clipboardRef.current;
                    duplicateGraph(cn, ce, true);
                    e.preventDefault();
                }
            } else if (meta && key === "d") {
                duplicateSelection(false);
                e.preventDefault();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [duplicateSelection, getSelectedGraph, duplicateGraph]);

    // Web MIDI integration (uses nodesRef defined above)
    React.useEffect(() => {
        let mounted = true;
        const STATUS_PREFIX = "[MIDI]";

        const activeNotesRef = new Map<string, Set<number>>(); // nodeId -> active note numbers

        const setStatusAll = (status: string) => {
            setNodes((prev) =>
                prev.map((n) =>
                    n.type === "midi-input"
                        ? { ...n, data: { ...n.data, status } }
                        : n
                )
            );
        };
        const setErrorAll = (error: string) => {
            setNodes((prev) =>
                prev.map((n) =>
                    n.type === "midi-input"
                        ? { ...n, data: { ...n.data, error } }
                        : n
                )
            );
        };

        if (typeof window === "undefined") return;
        const secure = window.isSecureContext;
        console.info(
            STATUS_PREFIX,
            "secureContext=",
            secure,
            "protocol=",
            location.protocol,
            "host=",
            location.host
        );
        if (!secure) {
            setStatusAll("insecure-context");
            return;
        }
        if (!("requestMIDIAccess" in navigator)) {
            setStatusAll("unsupported");
            return;
        }

        // Simplified: use built-in Web MIDI types (lib.dom) and helper functions

        const getInputs = (access: MIDIAccess): MIDIInput[] => {
            try {
                return Array.from(access.inputs.values());
            } catch {
                return [];
            }
        };

        interface MidiNodeData {
            deviceId?: string;
            devices?: Array<{ id: string; name: string }>;
            status?: string;
            activeNotes?: number[];
            channel?: number | "all";
            error?: string;
            [k: string]: unknown;
        }

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
                type GenericNode = (typeof prev)[number];
                const updated = prev.map((n) => {
                    if (n.type !== "midi-input") return n;
                    const existing = n.data as unknown as MidiNodeData;
                    const currentId = existing.deviceId || "";
                    const nextId =
                        currentId && list.some((d) => d.id === currentId)
                            ? currentId
                            : "";
                    const hasActive =
                        Array.isArray(existing.activeNotes) &&
                        existing.activeNotes.length > 0;
                    const newData: MidiNodeData = {
                        ...existing,
                        devices: list,
                        deviceId: nextId,
                        status: hasActive ? existing.status : "listening",
                    };
                    return {
                        ...n,
                        data: newData as unknown as GenericNode["data"],
                    };
                }) as typeof prev;
                return updated;
            });
            if (list.length === 0) setStatusAll("no-devices");
            else setStatusAll("listening");
        };

        let accessRef: MIDIAccess | null = null;
        let requesting = false;

        const attachHandlers = (access: MIDIAccess) => {
            if (!mounted) return;
            // Clear previous generic errors on success
            setNodes((prev) =>
                prev.map((n) =>
                    n.type === "midi-input"
                        ? { ...n, data: { ...n.data, error: undefined } }
                        : n
                )
            );
            publishDevices(access);
            const updateInputHandlers = () => {
                if (!mounted) return;
                publishDevices(access);
                const inputs = getInputs(access);
                if (!inputs.length) {
                    /* no inputs */
                }
                for (const input of inputs) {
                    input.onmidimessage = (e: MIDIMessageEvent) => {
                        const bytes = e.data;
                        if (!bytes || bytes.length < 1) return;
                        const status = bytes[0] & 0xff;
                        const typeHigh = status & 0xf0;
                        const isChannelMsg =
                            typeHigh >= 0x80 && typeHigh <= 0xe0;
                        const channel = isChannelMsg
                            ? (status & 0x0f) + 1
                            : null;
                        let label = "";
                        switch (typeHigh) {
                            case 0x80:
                                label = "NoteOff";
                                break;
                            case 0x90:
                                label =
                                    (bytes[2] ?? 0) === 0
                                        ? "NoteOff"
                                        : "NoteOn";
                                break;
                            case 0xa0:
                                label = "PolyAT";
                                break;
                            case 0xb0:
                                label = "CC";
                                break;
                            case 0xc0:
                                label = "Prog";
                                break;
                            case 0xd0:
                                label = "ChAT";
                                break;
                            case 0xe0:
                                label = "Pitch";
                                break;
                            default:
                                if (status === 0xf8) label = "Clock";
                                else if (status === 0xfa) label = "Start";
                                else if (status === 0xfc) label = "Stop";
                                else label = `0x${status.toString(16)}`;
                        }
                        const nodesSnap = nodesRef.current;
                        for (const n of nodesSnap) {
                            if (n.type !== "midi-input") continue;
                            const nd =
                                (n.data as unknown as MidiNodeData) || {};
                            const devFilter = (nd.deviceId || "").trim();
                            const inName = (input.name || "").trim();
                            if (
                                devFilter &&
                                devFilter !== (input.id || "") &&
                                devFilter !== inName
                            )
                                continue;
                            if (
                                nd.channel &&
                                nd.channel !== "all" &&
                                channel !== null &&
                                nd.channel !== channel
                            )
                                continue;
                            const cmd = status & 0xf0;
                            if (cmd === 0x90 || cmd === 0x80) {
                                const note = (bytes[1] ?? 0) & 0x7f;
                                const vel = (bytes[2] ?? 0) & 0x7f;
                                let set = activeNotesRef.get(n.id);
                                if (!set) {
                                    set = new Set();
                                    activeNotesRef.set(n.id, set);
                                }
                                if (cmd === 0x90 && vel > 0) set.add(note);
                                else set.delete(note);
                            }
                            const activeSet =
                                activeNotesRef.get(n.id) || new Set<number>();
                            const notesArr = Array.from(activeSet.values());
                            setNodes((prev) => {
                                type GenericNode = (typeof prev)[number];
                                const updated = prev.map((p) => {
                                    if (p.id !== n.id) return p;
                                    const existing =
                                        p.data as unknown as MidiNodeData;
                                    const statusStrBase =
                                        notesArr.length > 0
                                            ? [...notesArr]
                                                  .sort((a, b) => a - b)
                                                  .join(",")
                                            : label;
                                    const statusStr =
                                        notesArr.length === 0 &&
                                        (label === "NoteOff" ||
                                            label === "NoteOn")
                                            ? "listening"
                                            : statusStrBase;
                                    const newData: MidiNodeData = {
                                        ...existing,
                                        status: statusStr,
                                        activeNotes: notesArr,
                                    };
                                    return {
                                        ...p,
                                        data: newData as unknown as GenericNode["data"],
                                    };
                                }) as typeof prev;
                                return updated;
                            });
                            sendMIDI(n.id, [
                                {
                                    data: [
                                        status,
                                        bytes[1] ?? 0,
                                        bytes[2] ?? 0,
                                    ] as [number, number, number],
                                    atTimeMs: e.timeStamp,
                                },
                            ]);
                        }
                    };
                }
            };
            updateInputHandlers();
            try {
                const hasAdd = (
                    access as unknown as {
                        addEventListener?: (t: string, cb: () => void) => void;
                    }
                ).addEventListener;
                if (typeof hasAdd === "function") {
                    hasAdd.call(access, "statechange", updateInputHandlers);
                } else if (typeof access.onstatechange !== "undefined") {
                    access.onstatechange = updateInputHandlers;
                }
            } catch {
                /* ignore */
            }
        };

        const requestMIDI = async () => {
            if (requesting || accessRef || !mounted) return;
            requesting = true;
            setStatusAll("requesting");
            try {
                const requestFn = navigator.requestMIDIAccess?.bind(navigator);
                if (typeof requestFn !== "function") {
                    setStatusAll("unsupported");
                    requesting = false;
                    return;
                }
                const access = await requestFn({ sysex: false });
                if (!mounted) return;
                accessRef = access;
                attachHandlers(access);
            } catch (err) {
                const name =
                    (err as { name?: string } | null | undefined)?.name ||
                    "Error";
                const message =
                    (err as { message?: string } | null | undefined)?.message ||
                    "";
                console.warn(
                    STATUS_PREFIX,
                    "requestMIDIAccess failed",
                    name,
                    message
                );
                const classified =
                    name === "NotAllowedError" || name === "SecurityError"
                        ? "denied"
                        : name === "TypeError"
                        ? "unsupported"
                        : "error";
                setStatusAll(classified);
                setErrorAll(
                    name === "TypeError"
                        ? "TypeError (maybe blocked flag or experimental feature disabled)"
                        : name
                );
            } finally {
                requesting = false;
            }
        };

        // Listen for retry events from nodes
        const onRetry = () => {
            void requestMIDI();
        };
        window.addEventListener("audioNodesRetryMIDI", onRetry);

        // Initial attempt (can be moved behind a user gesture if needed)
        void requestMIDI();

        return () => {
            mounted = false;
            window.removeEventListener("audioNodesRetryMIDI", onRetry);
        };
    }, [sendMIDI, setNodes]);

    const edgeTypes = React.useMemo(() => ({ gradient: GradientEdge }), []);

    return (
        <div className="h-screen w-screen relative bg-gray-900 overflow-hidden">
            {/* Startup overlay to initialize audio context */}
            {!audioInitialized && (
                <div className="absolute inset-0 z-[60] flex items-center justify-center bg-gray-900/70 backdrop-blur-xl">
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-xl max-w-sm w-[90%] text-center">
                        <h2 className="title-font text-lg text-white mb-2">
                            Initialize Audio
                        </h2>
                        <p className="text-sm text-gray-300 mb-4">
                            Click to start the audio engine (required by browser
                            autoplay policies).
                        </p>
                        <button
                            onClick={() => {
                                void initializeAudio();
                            }}
                            className="px-4 py-2 rounded-lg font-medium bg-purple-600 hover:bg-purple-700 text-white w-full shadow"
                        >
                            Start Audio
                        </button>
                    </div>
                </div>
            )}
            <div className="absolute inset-0">
                <div className="absolute inset-0">
                    <ReactFlow
                        nodes={nodes}
                        edges={edges.map((e) => ({ ...e, type: "gradient" }))}
                        edgeTypes={edgeTypes}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onConnectStart={handleConnectStart}
                        onConnectEnd={handleConnectEnd}
                        connectionLineStyle={
                            connectingColor
                                ? { stroke: connectingColor, strokeWidth: 2 }
                                : { stroke: "#555", strokeWidth: 2 }
                        }
                        nodeTypes={nodeTypes}
                        minZoom={0.03}
                        maxZoom={3}
                        className="react-flow-dark h-full w-full"
                        isValidConnection={isValidConnection}
                        onInit={(instance) => {
                            rfInstanceRef.current = instance;
                        }}
                        proOptions={{
                            hideAttribution: true
                        }}
                    >
                        <MiniMap
                            className="react-flow-minimap-dark !top-auto !right-auto bg-gray-800/80 backdrop-blur-md rounded-xl border border-gray-700/80 shadow"
                            style={{ width: 288, height: 146 }}
                            nodeBorderRadius={5}
                            pannable
                            zoomable
                            offsetScale={0}
                        />
                        <Background
                            variant={BackgroundVariant.Dots}
                            gap={12}
                            size={1}
                            className="bg-gray-900"
                        />
                    </ReactFlow>
                </div>
                {/* Left panel moved slightly up to reduce gap while staying below title bar */}
                <div className="absolute top-16 left-4 bottom-44 z-50 w-72 flex flex-col pointer-events-auto gap-4">
                    <SaveLoadPanel
                        onSave={handleSaveClick}
                        onLoadObject={handleLoadFromObject}
                        onLoadDefault={handleLoadDefault}
                    />
                    <div className="bg-gray-800/80 backdrop-blur-md rounded-xl p-3 shadow border border-gray-700/80 flex-1 overflow-y-auto">
                        <NodeLibrary onAddNode={onAddNode} />
                    </div>
                </div>
            </div>
        </div>
    );
}
