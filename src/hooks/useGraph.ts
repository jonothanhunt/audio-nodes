"use client";

import { useCallback } from "react";
import {
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
} from "reactflow";
import { getHandleRole } from "@/lib/handles";

export function useGraph() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);

  const generateNodeId = useCallback(() => {
    const existing = new Set(nodes.map((n) => n.id));
    let id = "";
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      do {
        id = `n-${(crypto as Crypto).randomUUID()}`;
      } while (existing.has(id));
      return id;
    }
    do {
      id = `n-${Math.random().toString(36).slice(2, 10)}`;
    } while (existing.has(id));
    return id;
  }, [nodes]);

  const isValidConnection = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return false;

      const fromRole = getHandleRole(
        sourceNode.type,
        connection.sourceHandle || undefined
      );
      const toRole = getHandleRole(
        targetNode.type,
        connection.targetHandle || undefined
      );

      const audioOk = fromRole === "audio-out" && toRole === "audio-in";
      const midiOk = fromRole === "midi-out" && toRole === "midi-in";
      return audioOk || midiOk;
    },
    [nodes]
  );

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) => (isValidConnection(params) ? addEdge(params, eds) : eds)),
    [setEdges, isValidConnection]
  );

  return {
    nodes,
    setNodes,
    onNodesChange,
    edges,
    setEdges,
    onEdgesChange,
    generateNodeId,
    isValidConnection,
    onConnect,
  } as const;
}
