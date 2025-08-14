import { NodeShell } from '../node-framework/NodeShell';
import { NodeSpec } from '../node-framework/types';

interface ValueStringData { value?: string; options?: string; _connectedParams?: string[]; onParameterChange: (nodeId: string, key: string, value: unknown) => void; [k:string]: unknown; }
interface ValueStringNodeProps { id: string; selected?: boolean; data: ValueStringData; }

const spec: NodeSpec = {
    type: 'value-string',
    // title omitted (registry provides)
    // accentColor centralized in registry category (Value)
    params: [
        { key: 'value', kind: 'text', default: '', label: 'Value' },
        { key: 'options', kind: 'text', default: '', label: 'Options (CSV)' }
    ],
        outputs: [ { id: 'param-out', role: 'param-out', label: 'String Out' } ],
    help: {
        description: 'String/enum value node. Provide options via CSV to turn the value param into a dropdown.',
        inputs: [
            { name: 'Value (string)', description: 'Optional param input overriding local edit.' },
            { name: 'Options (CSV)', description: 'Comma-separated list enabling dropdown selection.' }
        ],
        outputs: [ { name: 'String Out', description: 'String value for connected targets.' } ]
    }
};

export default function ValueStringNode({ id, data, selected }: ValueStringNodeProps) {
    const { onParameterChange } = data;
    return <NodeShell id={id} data={data} spec={spec} selected={selected} onParameterChange={onParameterChange} />;
}
