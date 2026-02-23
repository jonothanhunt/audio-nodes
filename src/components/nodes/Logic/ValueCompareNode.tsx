import { NodeShell } from "../../node-framework/NodeShell";
import { NodeSpec } from "../../node-framework/types";

interface NodeData { onParameterChange: (nodeId: string, key: string, value: unknown) => void;[k: string]: unknown; }
interface Props { id: string; selected?: boolean; data: NodeData; }

export const spec: NodeSpec = {
    type: 'logic-compare',
    params: [
        { key: 'a', kind: 'number', default: 0, label: 'A' },
        { key: 'b', kind: 'number', default: 0, label: 'B' },
        { key: 'operation', kind: 'select', default: '>', label: 'Compare', options: ['>', '<', '>=', '<=', '==', '!='] },
    ],
    outputs: [{ id: 'param-out', role: 'param-out', label: 'Result', variant: 'bool' }],
    help: {
        description: 'Compares value A to value B and outputs a boolean result.',
        inputs: [
            { name: 'A', description: 'First numeric value to compare' },
            { name: 'B', description: 'Second numeric value to compare' },
            { name: 'Compare', description: 'The comparison operation to perform' }
        ],
        outputs: [{ name: 'Result', description: 'True if the comparison holds, otherwise False.' }]
    }
};

export default function ValueCompareNode({ id, data, selected }: Props) {
    return <NodeShell id={id} data={data} spec={spec} selected={selected} onParameterChange={data.onParameterChange} />;
}
