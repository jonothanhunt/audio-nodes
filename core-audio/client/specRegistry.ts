/**
 * specRegistry — single source of truth for node specs.
 *
 * Imports every NodeSpec and provides `getHandleRoleFromSpec` so that
 * handles.ts can derive connection roles directly from the spec instead
 * of maintaining a parallel switch statement.
 */

import { NodeSpec } from "@/components/editor/types";
import { spec as oscillatorSpec } from "@/components/nodes/OscillatorNode";
import { spec as reverbSpec } from "@/components/nodes/ReverbNode";
import { spec as speakerSpec } from "@/components/nodes/SpeakerNode";
import { spec as sequencerSpec } from "@/components/nodes/SequencerNode";
import { spec as arpeggiatorSpec } from "@/components/nodes/ArpeggiatorNode";
import { spec as synthSpec } from "@/components/nodes/SynthesizerNode";
import { spec as midiInputSpec } from "@/components/nodes/MidiInputNode";
import { spec as midiTransposeSpec } from "@/components/nodes/MidiTransposeNode";
import { spec as valueBoolSpec } from "@/components/nodes/ValueBoolNode";
import { spec as valueNumberSpec } from "@/components/nodes/ValueNumberNode";
import { spec as valueTextSpec } from "@/components/nodes/ValueTextNode";
import { spec as valueSelectSpec } from "@/components/nodes/ValueSelectNode";
import { spec as lfoSpec } from "@/components/nodes/LFONode";
import { spec as cameraHandsSpec } from "@/components/nodes/CameraHandsNode";
import { spec as logicCompareSpec } from "@/components/nodes/ValueCompareNode";
import { spec as logicGateSpec } from "@/components/nodes/ValueLogicNode";
import { spec as logicAddSpec } from "@/components/nodes/ValueAddNode";
import { spec as logicSubtractSpec } from "@/components/nodes/ValueSubtractNode";
import { spec as logicMultiplySpec } from "@/components/nodes/ValueMultiplyNode";
import { spec as logicDivideSpec } from "@/components/nodes/ValueDivideNode";
import { spec as logicConditionSpec } from "@/components/nodes/ValueConditionNode";
import { spec as logicToRangeSpec } from "@/components/nodes/ToRangeNode";
import { spec as logicFromRangeSpec } from "@/components/nodes/FromRangeNode";
import { getHandleRole, HandleRole } from './handles';
import { AudioNodeData } from './audio/types';

type SpecLike = Pick<NodeSpec, "params" | "inputs" | "outputs">;

const SPEC_REGISTRY: Record<string, SpecLike> = {
    oscillator: oscillatorSpec,
    reverb: reverbSpec,
    speaker: speakerSpec,
    sequencer: sequencerSpec as SpecLike,
    arpeggiator: arpeggiatorSpec,
    synth: synthSpec,
    "midi-input": midiInputSpec,
    "midi-transpose": midiTransposeSpec,
    "value-bool": valueBoolSpec,
    "value-number": valueNumberSpec,
    "value-text": valueTextSpec,
    "value-select": valueSelectSpec,
    lfo: lfoSpec,
    "camera-hands": cameraHandsSpec,
    "logic-compare": logicCompareSpec,
    "logic-gate": logicGateSpec,
    "logic-add": logicAddSpec,
    "logic-subtract": logicSubtractSpec,
    "logic-multiply": logicMultiplySpec,
    "logic-divide": logicDivideSpec,
    "logic-condition": logicConditionSpec,
    "logic-to-range": logicToRangeSpec,
    "logic-from-range": logicFromRangeSpec,
};

/**
 * Derive the connection role for a given (nodeType, handleId) pair by
 * looking up the node's NodeSpec. This replaces the switch in handles.ts.
 */
export function getHandleRoleFromSpec(
    nodeType: string | undefined,
    handleId: string | undefined,
): HandleRole {
    if (!nodeType) return "unknown";
    const spec = SPEC_REGISTRY[nodeType];
    if (!spec) return "unknown";

    // Check outputs
    for (const out of spec.outputs ?? []) {
        if (out.id === handleId || handleId == null) {
            return out.role as HandleRole;
        }
    }

    // Check explicit inputs (audio-in, midi-in, etc.)
    for (const inp of spec.inputs ?? []) {
        if (inp.id === handleId) {
            return inp.role as HandleRole;
        }
    }

    // Check params — each exposed param key becomes a param-in handle
    for (const p of spec.params ?? []) {
        if ((p as { handle?: boolean }).handle === false) continue; // explicitly hidden
        if (p.key === handleId) return "param-in";
    }

    return "unknown";
}
