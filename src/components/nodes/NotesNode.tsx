import { NodeResizeControl, useReactFlow } from 'reactflow';
import { NodeShell } from "@/components/editor/NodeShell";
import { NodeSpec } from "@/components/editor/types";
import { getNodeMeta } from "@core-audio/client/nodeRegistry";


interface NotesNodeData {
    text?: string;
    width?: number;
    height?: number;
    onParameterChange: (nodeId: string, key: string, value: unknown) => void;
    [k: string]: unknown;
}

interface NotesNodeProps {
    id: string;
    selected?: boolean;
    data: NotesNodeData;
}

export const spec: NodeSpec = {
    type: 'notes',
    params: [],
    inputs: [],
    outputs: [],
};

const ResizerHandle = ({ color }: { color: string }) => (
    <div className="notes-resizer-handle pointer-events-none">
        <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full"
        >
            <path
                d="M18 10 A 8 8 0 0 1 10 18"
                stroke={color}
                strokeWidth="3"
                strokeLinecap="round"
            />
        </svg>
    </div>
);




export default function NotesNode({ id, data, selected }: NotesNodeProps) {
    const { onParameterChange, text = "" } = data;
    const { accentColor } = getNodeMeta('notes');

    const { setNodes } = useReactFlow();

    const handleFocus = () => {
        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === id) {
                    return { ...node, selected: true };
                }
                return { ...node, selected: false };
            })
        );
    };

    return (
        <div className="h-full w-full min-w-[200px] min-h-[150px] flex flex-col justify-start">
            {selected && (
                <NodeResizeControl
                    position="bottom-right"
                    minWidth={200}
                    minHeight={150}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        width: '32px',
                        height: '32px',
                        bottom: '0',
                        right: '0',
                    }}
                >
                    <ResizerHandle color={accentColor} />
                </NodeResizeControl>
            )}
            <NodeShell
                id={id}
                data={data}
                spec={spec}
                selected={selected}
                onParameterChange={onParameterChange}
            >
                <div className="flex-1 flex flex-col min-h-0 h-full justify-start items-stretch">
                    <textarea
                        value={text}
                        onChange={(e) => onParameterChange(id, 'text', e.target.value)}
                        onFocus={handleFocus}
                        placeholder="Write your note here..."
                        className="nodrag nowheel w-full h-full min-h-[100px] bg-transparent text-gray-200 resize-none focus:outline-none text-2xl font-normal leading-relaxed p-0 border-none scrollbar-thin scrollbar-thumb-gray-700 tracking-wide flex-1"
                        style={{
                            fontFamily: 'inherit',
                            background: 'transparent',
                            textAlign: 'left',
                            verticalAlign: 'top'
                        }}
                    />
                </div>
            </NodeShell>
        </div>
    );
}
