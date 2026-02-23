import { NodeShell } from "@/components/editor/NodeShell";
import { NodeSpec } from "@/components/editor/types";

interface NodeData { onParameterChange: (nodeId: string, key: string, value: unknown) => void;[k: string]: unknown; }
interface Props { id: string; selected?: boolean; data: NodeData; }

export const spec: NodeSpec = {
    type: 'logic-multiply',
    params: [
        { key: 'a', kind: 'number', default: 1, label: 'A' },
        { key: 'b', kind: 'number', default: 1, label: 'B' },
    ],
    outputs: [{ id: 'param-out', role: 'param-out', label: 'A × B', variant: 'numeric' }],
    help: {
        description: 'Multiplies two numeric values together.',
        inputs: [
            { name: 'A', description: 'First factor' },
            { name: 'B', description: 'Second factor' }
        ],
        outputs: [{ name: 'A × B', description: 'The product of A and B.' }]
    }
};

export default function ValueMultiplyNode({ id, data, selected }: Props) {
    return <NodeShell id={id} data={data} spec={spec} selected={selected} onParameterChange={data.onParameterChange} />;
}
