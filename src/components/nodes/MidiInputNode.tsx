import React from 'react';
import { NodeShell } from '../node-framework/NodeShell';
import { NodeSpec } from '../node-framework/types';
import { labelCls, inputCls } from '../node-ui/styles/inputStyles';

interface MidiInputNodeData { deviceId?: string; channel?: number | 'all'; status?: string; devices?: Array<{id:string; name:string}>; error?: string; onParameterChange?: (nodeId: string, key: string, value: unknown)=>void; [k:string]: unknown; }
interface MidiInputNodeProps { id: string; selected?: boolean; data: MidiInputNodeData; }

const spec: NodeSpec = {
    type: 'midi-input',
    // title omitted (registry provides)
    // accentColor & icon centralized in registry
        outputs: [ { id: 'midi', role: 'midi-out', label: 'MIDI Out' } ],
            params: [
                { key: 'deviceId', kind: 'text', default: '', label: 'Device', hidden: true },
                { key: 'channel', kind: 'text', default: 'all', label: 'Channel', hidden: true },
                { key: 'status', kind: 'text', default: '', hidden: true },
                { key: 'error', kind: 'text', default: '', hidden: true }
            ],
    help: {
        description: 'Receives MIDI messages from a connected hardware or virtual device.',
        inputs: [ { name: 'Device', description: 'Selected MIDI input (or All).' }, { name: 'Channel', description: 'Filter for a specific channel or All.' } ],
        outputs: [ { name: 'MIDI Out', description: 'Forwarded MIDI events.' } ]
    },
    // icon centralized in registry
        paramHandles: false,
        renderBeforeParams: ({ data, update }) => {
            const devices = Array.isArray(data.devices) ? data.devices as Array<{id:string; name:string}> : [];
        const deviceId = String(data.deviceId || '');
        const channel = data.channel ?? 'all';
        const status = data.error ? undefined : data.status as string | undefined;
        const error = data.error as string | undefined;
        const stop = (e: React.SyntheticEvent)=> e.stopPropagation();
        return (
            <div className="flex flex-col gap-2">
                <div className="relative flex items-center h-8">
                    <label className={labelCls}>Device</label>
                    <select className={`${inputCls} w-40 text-xs nodrag`} value={deviceId} onChange={e=>update('deviceId', e.target.value)} onPointerDown={stop} onMouseDown={stop} onClick={stop} onDoubleClick={stop}>
                        <option value="">(All)</option>
                        {devices.map((d, idx)=>{
                            const optId = d.id || `dev-${idx}`;
                            const label = d.name?.trim().length ? d.name : d.id?.trim().length ? d.id : `Device ${idx+1}`;
                            return <option key={optId+idx} value={d.id}>{label}</option>;
                        })}
                    </select>
                </div>
                <div className="relative flex items-center h-8">
                    <label className={labelCls}>Channel</label>
                    <select className={`${inputCls} w-24 text-center nodrag`} value={String(channel)} onChange={e=>update('channel', e.target.value === 'all' ? 'all' : parseInt(e.target.value,10))} onPointerDown={stop} onMouseDown={stop} onClick={stop} onDoubleClick={stop}>
                        <option value="all">All</option>
                        {Array.from({length:16}).map((_,i)=><option key={i} value={i+1}>{i+1}</option>)}
                    </select>
                </div>
                <div className="relative flex items-center h-8">
                    <label className={labelCls}>Status</label>
                    {status || error ? (
                        <div className={`text-xs ${error ? 'text-red-400':'text-gray-400'} truncate max-w-[7rem]`}>{error || status}</div>
                    ) : <div className="text-xs text-gray-500">idle</div>}
                </div>
            </div>
        );
    }
};

export default function MidiInputNode({ id, data, selected }: MidiInputNodeProps) {
    const { onParameterChange } = data;
    return <NodeShell id={id} data={data} spec={spec} selected={selected} onParameterChange={(nid,key,value)=>onParameterChange?.(nid,key,value)} />;
}
