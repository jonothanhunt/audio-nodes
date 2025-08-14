// Unified default data retrieval now driven by nodeRegistry definitions.
// getDefaultNodeData now defers to each NodeSpec's param defaults (applied lazily in useNodeSpec).
// We only attach function handlers and any non-param structural fields we need up-front.
export function getDefaultNodeData(
    type: string,
    onParameterChange: (nodeId: string, parameter: string, value: string | number | boolean | unknown) => void,
    onEmitMidi?: (
        sourceId: string,
        events: Array<{ data: [number, number, number]; atFrame?: number; atTimeMs?: number }>,
    ) => void,
) {
    const base: Record<string, unknown> = { onParameterChange };
    if (type === 'sequencer' || type === 'arpeggiator' || type === 'midi-input') {
        base.onEmitMidi = onEmitMidi;
    }
    return base;
}
