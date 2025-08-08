"use client";

import React from "react";
import type { Edge, Node, ReactFlowInstance, Viewport } from "reactflow";
import type { ProjectSaveFile } from "@/types/project";
import { isRecord } from "@/lib/utils";

const LOCAL_STORAGE_KEY = "audionodes:lastProject";

function stripNodeData(data: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (typeof v === "function") continue;
    if (k.startsWith("on")) continue;
    out[k] = v as unknown;
  }
  return out;
}

export function useProjectPersistence(
  nodes: Node[],
  edges: Edge[],
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
  rfInstanceRef: React.MutableRefObject<ReactFlowInstance | null>,
  reattachHandlers: (data: Record<string, unknown> | undefined) => Record<string, unknown>
) {
  const makeSaveObject = React.useCallback((): ProjectSaveFile => {
    const viewport = rfInstanceRef.current?.getViewport();
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: stripNodeData(n.data as Record<string, unknown>),
      })),
      edges: edges.map((e) => ({
        id:
          e.id ||
          `${e.source}-${e.sourceHandle || "out"}->${e.target}-${
            e.targetHandle || "in"
          }`,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || undefined,
        targetHandle: e.targetHandle || undefined,
      })),
      viewport,
    };
  }, [nodes, edges, rfInstanceRef]);

  const downloadJSON = React.useCallback((obj: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  const handleSaveClick = React.useCallback(() => {
    const save = makeSaveObject();
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    downloadJSON(save, `audionodes-${ts}.json`);
  }, [makeSaveObject, downloadJSON]);

  const handleLoadFromObject = React.useCallback(
    (obj: unknown) => {
      if (!isRecord(obj)) return false;
      const maybe = obj as Partial<ProjectSaveFile>;
      const rawNodes = Array.isArray(maybe.nodes) ? maybe.nodes : [];
      const rawEdges = Array.isArray(maybe.edges) ? maybe.edges : [];

      const loadedNodes: Node[] = rawNodes.map((n) => ({
        id: String(n.id),
        type: n.type,
        position: n.position || { x: 0, y: 0 },
        data: reattachHandlers(n.data as Record<string, unknown> | undefined),
      }));

      const loadedEdges: Edge[] = rawEdges.map((e) => ({
        id:
          e.id ||
          `${e.source}-${e.sourceHandle || "out"}->${e.target}-${
            e.targetHandle || "in"
          }`,
        source: String(e.source),
        target: String(e.target),
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      }));

      setNodes(loadedNodes);
      setEdges(loadedEdges);

      // Restore viewport if present
      if (maybe.viewport && rfInstanceRef.current) {
        const v = maybe.viewport as Viewport;
        rfInstanceRef.current.setViewport(
          { x: v.x || 0, y: v.y || 0, zoom: v.zoom || 1 },
          { duration: 0 }
        );
      }
      return true;
    },
    [setNodes, setEdges, reattachHandlers, rfInstanceRef]
  );

  const handleLoadFile = React.useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const obj = JSON.parse(String(reader.result || "{}")) as unknown;
          handleLoadFromObject(obj);
        } catch (err) {
          console.error("Failed to parse project file:", err);
        }
      };
      reader.readAsText(file);
    },
    [handleLoadFromObject]
  );

  const onDropProjectFile: React.DragEventHandler<HTMLDivElement> =
    React.useCallback(
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer?.files?.[0];
        if (
          file &&
          (file.type === "application/json" || file.name.endsWith(".json"))
        ) {
          handleLoadFile(file);
        }
      },
      [handleLoadFile]
    );

  const onDragOverProjectFile: React.DragEventHandler<HTMLDivElement> =
    React.useCallback((e) => {
      e.preventDefault();
    }, []);

  // Local Storage persistence
  const saveToLocalStorage = React.useCallback(() => {
    try {
      const save = makeSaveObject();
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(save));
      return true;
    } catch {
      return false;
    }
  }, [makeSaveObject]);

  // Debounced autosave when nodes/edges change
  React.useEffect(() => {
    const h = setTimeout(() => {
      saveToLocalStorage();
    }, 300);
    return () => clearTimeout(h);
  }, [nodes, edges, saveToLocalStorage]);

  const loadFromLocalStorage = React.useCallback(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) return false;
      const obj = JSON.parse(raw);
      return handleLoadFromObject(obj);
    } catch {
      return false;
    }
  }, [handleLoadFromObject]);

  const handleLoadDefault = React.useCallback(async () => {
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
        return true;
      } catch {
        // try next
      }
    }
    return false;
  }, [handleLoadFromObject]);

  return {
    makeSaveObject,
    handleSaveClick,
    handleLoadFromObject,
    handleLoadFile,
    onDropProjectFile,
    onDragOverProjectFile,
    // new
    saveToLocalStorage,
    loadFromLocalStorage,
    handleLoadDefault,
  } as const;
}
