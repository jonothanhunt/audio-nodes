import { NodeShell } from '../node-framework/NodeShell';
import { NodeSpec } from '../node-framework/types';

interface ValueSelectData { value?: string; options?: string; _connectedParams?: string[]; onParameterChange: (nodeId: string, key: string, value: unknown) => void; [k:string]: unknown; }
interface ValueSelectNodeProps { id: string; selected?: boolean; data: ValueSelectData; }

const spec: NodeSpec = {
    type: 'value-select',
    title: 'Select',
    accentColor: '#6366f1',
    params: [
        { key: 'value', kind: 'text', default: '', label: 'Value' },
        { key: 'options', kind: 'text', default: '', label: 'Options (CSV)' }
    ],
        outputs: [ { id: 'param-out', role: 'param-out', label: 'Select Out' } ],
    help: {
        description: 'Dropdown string value. Provide options via the options CSV (e.g., A,B,C).',
        inputs: [
            { name: 'Value (string)', description: 'Optional param input overriding local selection.' },
            { name: 'Options (string)', description: 'Comma-separated list used for dropdown choices.' }
        ],
        outputs: [ { name: 'Select Out', description: 'Selected string value.' } ]
    },
    icon: undefined
};

export default function ValueSelectNode({ id, data, selected }: ValueSelectNodeProps) {
    const { onParameterChange } = data;
    return <NodeShell id={id} data={data} spec={spec} selected={selected} onParameterChange={onParameterChange} />;
}
