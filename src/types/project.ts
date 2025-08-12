import type { Viewport } from "reactflow";

export interface SavedNode {
    id: string;
    type?: string;
    position: { x: number; y: number };
    data?: Record<string, unknown>;
}

export interface SavedEdge {
    id?: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
}

export interface ProjectSaveFile {
    version: number;
    createdAt?: string;
    nodes: SavedNode[];
    edges: SavedEdge[];
    viewport?: Viewport;
}
