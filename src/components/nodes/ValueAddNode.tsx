import { NodeShell } from "@/components/editor/NodeShell";
import { NodeSpec } from "@/components/editor/types";

interface NodeData { onParameterChange: (nodeId: string, key: string, value: unknown) => void;[k: string]: unknown; }
interface Props { id: string; selected?: boolean; data: NodeData; }

export const spec: NodeSpec = {
    type: 'logic-add',
    params: [
        { key: 'a', kind: 'number', default: 0, label: 'A' },
        { key: 'b', kind: 'number', default: 0, label: 'B' },
    ],
    outputs: [{ id: 'param-out', role: 'param-out', label: 'A + B', variant: 'numeric' }],
    help: {
        description: 'Adds two numeric values together.',
        inputs: [
            { name: 'A', description: 'First operand' },
            { name: 'B', description: 'Second operand' }
        ],
        outputs: [{ name: 'A + B', description: 'The sum of A and B.' }]
    }
};

export default function ValueAddNode({ id, data, selected }: Props) {
    return <NodeShell id={id} data={data} spec={spec} selected={selected} onParameterChange={data.onParameterChange} />;
}
