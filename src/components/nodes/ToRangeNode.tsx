import { NodeShell } from "@/components/editor/NodeShell";
import { NodeSpec } from "@/components/editor/types";

interface NodeData { onParameterChange: (nodeId: string, key: string, value: unknown) => void;[k: string]: unknown; }
interface Props { id: string; selected?: boolean; data: NodeData; }

export const spec: NodeSpec = {
    type: 'logic-to-range',
    params: [
        { key: 'inValue', kind: 'number', default: 0, label: 'Input (0-1)' },
        { key: 'min', kind: 'number', default: 0, label: 'Min' },
        { key: 'max', kind: 'number', default: 1, label: 'Max' },
    ],
    outputs: [{ id: 'param-out', role: 'param-out', label: 'Mapped Out', variant: 'numeric' }],
    help: {
        description: 'Maps a normalized input (0 to 1) to a target range [Min, Max].',
        inputs: [
            { name: 'inValue', description: 'Normalized value (0.0 to 1.0)' },
            { name: 'Min', description: 'Output value when input is 0.0' },
            { name: 'Max', description: 'Output value when input is 1.0' }
        ],
        outputs: [{ name: 'Mapped Out', description: 'The scaled value.' }]
    }
};

export default function ToRangeNode({ id, data, selected }: Props) {
    return <NodeShell id={id} data={data} spec={spec} selected={selected} onParameterChange={data.onParameterChange} />;
}
