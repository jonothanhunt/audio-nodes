import { NodeShell } from "@/components/editor/NodeShell";
import { NodeSpec } from "@/components/editor/types";

interface NodeData { onParameterChange: (nodeId: string, key: string, value: unknown) => void;[k: string]: unknown; }
interface Props { id: string; selected?: boolean; data: NodeData; }

export const spec: NodeSpec = {
    type: 'logic-from-range',
    params: [
        { key: 'inValue', kind: 'number', default: 0, label: 'Input' },
        { key: 'min', kind: 'number', default: 0, label: 'Min' },
        { key: 'max', kind: 'number', default: 1, label: 'Max' },
    ],
    outputs: [{ id: 'param-out', role: 'param-out', label: 'Normalized Out', variant: 'numeric' }],
    help: {
        description: 'Maps an input from a source range [Min, Max] to a normalized value (0 to 1).',
        inputs: [
            { name: 'inValue', description: 'Value within the source range' },
            { name: 'Min', description: 'Input value that results in 0.0' },
            { name: 'Max', description: 'Input value that results in 1.0' }
        ],
        outputs: [{ name: 'Normalized Out', description: 'The normalized value (0.0 to 1.0).' }]
    }
};

export default function FromRangeNode({ id, data, selected }: Props) {
    return <NodeShell id={id} data={data} spec={spec} selected={selected} onParameterChange={data.onParameterChange} />;
}
