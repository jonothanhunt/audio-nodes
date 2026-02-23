import { NodeShell } from "../../node-framework/NodeShell";
import { NodeSpec } from "../../node-framework/types";

interface NodeData { onParameterChange: (nodeId: string, key: string, value: unknown) => void;[k: string]: unknown; }
interface Props { id: string; selected?: boolean; data: NodeData; }

export const spec: NodeSpec = {
    type: 'logic-gate',
    params: [
        { key: 'a', kind: 'bool', default: false, label: 'A' },
        { key: 'b', kind: 'bool', default: false, label: 'B' },
        { key: 'operation', kind: 'select', default: 'AND', label: 'Gate', options: ['AND', 'OR', 'XOR', 'NOT'] },
    ],
    outputs: [{ id: 'param-out', role: 'param-out', label: 'Result', variant: 'bool' }],
    help: {
        description: 'Performs boolean logic on two inputs (A and B). NOT only considers input A.',
        inputs: [
            { name: 'A', description: 'First boolean input' },
            { name: 'B', description: 'Second boolean input (ignored for NOT)' },
            { name: 'Gate', description: 'The logic gate operation to perform' }
        ],
        outputs: [{ name: 'Result', description: 'Output of the logic gate.' }]
    }
};

export default function ValueLogicNode({ id, data, selected }: Props) {
    return <NodeShell id={id} data={data} spec={spec} selected={selected} onParameterChange={data.onParameterChange} />;
}
