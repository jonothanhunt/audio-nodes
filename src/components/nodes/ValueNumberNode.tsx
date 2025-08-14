import { NodeShell } from '../node-framework/NodeShell';
import { NodeSpec } from '../node-framework/types';

interface ValueNumberData { value?: number; ranged?: boolean; min?: number; max?: number; step?: number; _connectedParams?: string[]; onParameterChange: (nodeId: string, key: string, value: unknown) => void; [k:string]: unknown; }
interface ValueNumberNodeProps { id: string; selected?: boolean; data: ValueNumberData; }

// We'll implement range support using additional params; slider min/max/step only applied when ranged=true
const spec: NodeSpec = {
    type: 'value-number',
    title: 'Number',
    accentColor: '#0ea5e9',
    params: [
        { key: 'value', kind: 'number', default: 0, label: 'Value' },
        { key: 'ranged', kind: 'bool', default: false, label: 'Use Range' },
        { key: 'min', kind: 'number', default: 0, label: 'Min', hidden: false },
        { key: 'max', kind: 'number', default: 100, label: 'Max', hidden: false },
        { key: 'step', kind: 'number', default: 1, label: 'Step', hidden: false },
    ],
        outputs: [ { id: 'param-out', role: 'param-out', label: 'Number Out' } ],
    help: {
        description: 'Numeric value generator with optional slider range; exposes its value as a param output.',
        inputs: [
            { name: 'Value (number)', description: 'Optional param input overriding local control.' },
            { name: 'Range controls', description: 'Min/Max/Step used when Use Range is enabled.' }
        ],
        outputs: [ { name: 'Number Out', description: 'Current numeric value.' } ]
    },
        icon: undefined
};

export default function ValueNumberNode({ id, data, selected }: ValueNumberNodeProps) {
    const { onParameterChange } = data;
    return <NodeShell id={id} data={data} spec={spec} selected={selected} onParameterChange={onParameterChange} />;
}
