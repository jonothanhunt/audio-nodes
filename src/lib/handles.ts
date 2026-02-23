/**
 * Map handle IDs to semantic roles for connection validation.
 *
 * Roles are derived from each node's exported NodeSpec via getHandleRoleFromSpec
 * in specRegistry.ts. Adding a new node type requires NO changes here — just
 * define the spec inside the component file (and register it in specRegistry.ts).
 */

export type HandleRole =
    | "audio-in"
    | "audio-out"
    | "param-in"
    | "param-out"
    | "midi-out"
    | "midi-in"
    | "unknown";

export { getHandleRoleFromSpec as getHandleRole } from "./specRegistry";
