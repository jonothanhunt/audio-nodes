import { NodeShell } from "@/components/editor/NodeShell";
import { NodeSpec } from "@/components/editor/types";

interface ValueNumberData { value?: number; onParameterChange: (nodeId: string, key: string, value: unknown) => void;[k: string]: unknown; }
interface ValueNumberNodeProps { id: string; selected?: boolean; data: ValueNumberData; }

export const spec: NodeSpec = {
    type: 'value-number',
    params: [
        { key: 'value', kind: 'number', default: 0, label: 'Value' },
    ],
    outputs: [{ id: 'param-out', role: 'param-out', label: 'Number Out' }],
    help: {
        description: 'Simple numeric value source.',
        inputs: [],
        outputs: [{ name: 'Number Out', description: 'Current numeric value.' }]
    }
};

export default function ValueNumberNode({ id, data, selected }: ValueNumberNodeProps) {
    const { onParameterChange } = data;
    return <NodeShell id={id} data={data} spec={spec} selected={selected} onParameterChange={onParameterChange} />;
}
