import { NodeShell } from "@/components/editor/NodeShell";
import { NodeSpec } from "@/components/editor/types";

interface NodeData { onParameterChange: (nodeId: string, key: string, value: unknown) => void;[k: string]: unknown; }
interface Props { id: string; selected?: boolean; data: NodeData; }

export const spec: NodeSpec = {
    type: 'logic-subtract',
    params: [
        { key: 'a', kind: 'number', default: 0, label: 'A' },
        { key: 'b', kind: 'number', default: 0, label: 'B' },
    ],
    outputs: [{ id: 'param-out', role: 'param-out', label: 'A - B', variant: 'numeric' }],
    help: {
        description: 'Subtracts B from A.',
        inputs: [
            { name: 'A', description: 'The number to subtract from (Minuend)' },
            { name: 'B', description: 'The number to subtract (Subtrahend)' }
        ],
        outputs: [{ name: 'A - B', description: 'The difference of A and B.' }]
    }
};

export default function ValueSubtractNode({ id, data, selected }: Props) {
    return <NodeShell id={id} data={data} spec={spec} selected={selected} onParameterChange={data.onParameterChange} />;
}
