import { NodeShell } from '../node-framework/NodeShell';
import { NodeSpec } from '../node-framework/types';

interface ValueBoolData { value?: boolean; _connectedParams?: string[]; onParameterChange: (nodeId: string, key: string, value: unknown) => void; [k:string]: unknown; }
interface ValueBoolNodeProps { id: string; selected?: boolean; data: ValueBoolData; }

const spec: NodeSpec = {
    type: 'value-bool',
    title: 'Bool',
    accentColor: '#22c55e',
    params: [ { key: 'value', kind: 'bool', default: false, label: 'Value' } ],
        outputs: [ { id: 'param-out', role: 'param-out', label: 'Bool Out' } ],
    help: {
        description: 'Boolean value generator; exposes its current state as a param output.',
        inputs: [ { name: 'Value (bool)', description: 'Optional param input overriding local toggle.' } ],
        outputs: [ { name: 'Bool Out', description: 'Boolean value for connected targets.' } ]
    },
    icon: undefined
};

export default function ValueBoolNode({ id, data, selected }: ValueBoolNodeProps) {
    const { onParameterChange } = data;
    return <NodeShell id={id} data={data} spec={spec} selected={selected} onParameterChange={onParameterChange} />;
}
