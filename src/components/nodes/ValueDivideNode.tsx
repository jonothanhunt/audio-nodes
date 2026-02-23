import { NodeShell } from "@/components/editor/NodeShell";
import { NodeSpec } from "@/components/editor/types";

interface NodeData { onParameterChange: (nodeId: string, key: string, value: unknown) => void;[k: string]: unknown; }
interface Props { id: string; selected?: boolean; data: NodeData; }

export const spec: NodeSpec = {
    type: 'logic-divide',
    params: [
        { key: 'a', kind: 'number', default: 1, label: 'A' },
        { key: 'b', kind: 'number', default: 1, label: 'B' },
    ],
    outputs: [{ id: 'param-out', role: 'param-out', label: 'A ÷ B', variant: 'numeric' }],
    help: {
        description: 'Divides A by B. If B is 0, the output is 0.',
        inputs: [
            { name: 'A', description: 'The number to be divided (Dividend)' },
            { name: 'B', description: 'The number to divide by (Divisor)' }
        ],
        outputs: [{ name: 'A ÷ B', description: 'The quotient of A and B.' }]
    }
};

export default function ValueDivideNode({ id, data, selected }: Props) {
    return <NodeShell id={id} data={data} spec={spec} selected={selected} onParameterChange={data.onParameterChange} />;
}
