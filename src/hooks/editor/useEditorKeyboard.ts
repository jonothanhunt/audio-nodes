"use client";
import { useEffect } from "react";
import { Node, Edge } from "reactflow";

interface UseEditorKeyboardOptions {
    getSelectedGraph: () => { selectedNodes: Node[]; selectedEdges: Edge[] };
    duplicateGraph: (nodes: Node[], edges: Edge[], centerInViewport: boolean) => void;
    duplicateSelection: (centerInViewport: boolean) => void;
    clipboardRef: React.RefObject<{ nodes: Node[]; edges: Edge[] } | null>;
}

/** Keyboard shortcuts: Cmd+C copy, Cmd+V paste, Cmd+D duplicate. */
export function useEditorKeyboard({
    getSelectedGraph,
    duplicateGraph,
    duplicateSelection,
    clipboardRef,
}: UseEditorKeyboardOptions) {
    useEffect(() => {
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
                clipboardRef.current = { nodes: selectedNodes, edges: selectedEdges };
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
    }, [getSelectedGraph, duplicateGraph, duplicateSelection, clipboardRef]);
}
