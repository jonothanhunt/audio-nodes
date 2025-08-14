import { NodeShell } from '../node-framework/NodeShell';
import { NodeSpec } from '../node-framework/types';

interface ValueTextData { value?: string; _connectedParams?: string[]; onParameterChange: (nodeId: string, key: string, value: unknown) => void; [k:string]: unknown; }
interface ValueTextNodeProps { id: string; selected?: boolean; data: ValueTextData; }

const spec: NodeSpec = {
    type: 'value-text',
    // title omitted (registry provides)
    // accentColor centralized in registry category (Value)
    params: [ { key: 'value', kind: 'text', default: '', label: 'Value' } ],
        outputs: [ { id: 'param-out', role: 'param-out', label: 'Text Out' } ],
    help: {
        description: 'Free-typed string value; exposes current text as param output.',
        inputs: [ { name: 'Value (string)', description: 'Optional param input overriding local text.' } ],
        outputs: [ { name: 'Text Out', description: 'String value for connected targets.' } ]
    }
};

export default function ValueTextNode({ id, data, selected }: ValueTextNodeProps) {
    const { onParameterChange } = data;
    return <NodeShell id={id} data={data} spec={spec} selected={selected} onParameterChange={onParameterChange} />;
}
