import React from "react";
import { NodeShell } from "@/components/editor/NodeShell";
import { NodeSpec, ParamSpec } from "@/components/editor/types";

interface NodeData {
    dataType?: 'number' | 'bool' | 'string';
    onParameterChange: (nodeId: string, key: string, value: unknown) => void;
    [k: string]: unknown;
}

interface Props { id: string; selected?: boolean; data: NodeData; }

// Static baseline spec for the registry to read
export const spec: NodeSpec = {
    type: 'logic-condition',
    params: [
        { key: 'dataType', kind: 'select', default: 'number', label: 'Type', options: ['number', 'bool', 'string'] },
        { key: 'condition', kind: 'bool', default: false, label: 'Condition' },
        { key: 'trueValue', kind: 'number', default: 1, label: 'If True' },
        { key: 'falseValue', kind: 'number', default: 0, label: 'If False' },
    ],
    outputs: [{ id: 'param-out', role: 'param-out', label: 'Output', variant: 'numeric' }],
    help: {
        description: 'Conditional branching (If/Then/Else). Pass true or false to Condition to select which value to output.',
        inputs: [
            { name: 'Condition', description: 'Boolean control signal' },
            { name: 'If True', description: 'Value emitted when Condition is true' },
            { name: 'If False', description: 'Value emitted when Condition is false' },
        ],
        outputs: [{ name: 'Output', description: 'The dynamically selected value.' }]
    }
};

export default function ValueConditionNode({ id, data, selected }: Props) {
    const currentType = data.dataType || 'number';

    const runtimeSpec = React.useMemo(() => {
        const dynamicSpec: NodeSpec = { ...spec };

        dynamicSpec.params = dynamicSpec.params.map(p => {
            if (p.key === 'trueValue' || p.key === 'falseValue') {
                const newKind = currentType === 'string' ? 'text' : currentType === 'number' ? 'number' : 'bool';
                const newDefault = currentType === 'number' ? 0 : currentType === 'bool' ? false : '';

                // This cast is necessary because TypeScript cannot infer the exact union member
                // based on the dynamic `newKind` and `newDefault` values.
                // We are asserting that the resulting object will conform to one of the NodeParamSpec union types.
                return {
                    ...p,
                    kind: newKind,
                    default: newDefault
                } as ParamSpec;
            }
            return p;
        });

        dynamicSpec.outputs = [{
            id: 'param-out',
            role: 'param-out',
            label: 'Output',
            variant: currentType === 'string' ? 'string' : currentType === 'bool' ? 'bool' : 'numeric'
        }];

        return dynamicSpec;
    }, [currentType]);

    return <NodeShell id={id} data={data} spec={runtimeSpec} selected={selected} onParameterChange={data.onParameterChange} />;
}
