/**
 * specRegistry — single source of truth for node specs.
 *
 * Imports every NodeSpec and provides `getHandleRoleFromSpec` so that
 * handles.ts can derive connection roles directly from the spec instead
 * of maintaining a parallel switch statement.
 */

import { NodeSpec } from "@/components/node-framework/types";
import { spec as oscillatorSpec } from "@/components/nodes/Synthesis/OscillatorNode";
import { spec as reverbSpec } from "@/components/nodes/Effects/ReverbNode";
import { spec as speakerSpec } from "@/components/nodes/Utility/SpeakerNode";
import { spec as sequencerSpec } from "@/components/nodes/MIDI/SequencerNode";
import { spec as arpeggiatorSpec } from "@/components/nodes/MIDI/ArpeggiatorNode";
import { spec as synthSpec } from "@/components/nodes/Synthesis/SynthesizerNode";
import { spec as midiInputSpec } from "@/components/nodes/MIDI/MidiInputNode";
import { spec as midiTransposeSpec } from "@/components/nodes/MIDI/MidiTransposeNode";
import { spec as valueBoolSpec } from "@/components/nodes/Value/ValueBoolNode";
import { spec as valueNumberSpec } from "@/components/nodes/Value/ValueNumberNode";
import { spec as valueTextSpec } from "@/components/nodes/Value/ValueTextNode";
import { spec as valueSelectSpec } from "@/components/nodes/Value/ValueSelectNode";
import { spec as lfoSpec } from "@/components/nodes/Utility/LFONode";
import { spec as cameraHandsSpec } from "@/components/nodes/Utility/CameraHandsNode";
import { spec as logicCompareSpec } from "@/components/nodes/Logic/ValueCompareNode";
import { spec as logicGateSpec } from "@/components/nodes/Logic/ValueLogicNode";
import { spec as logicAddSpec } from "@/components/nodes/Logic/ValueAddNode";
import { spec as logicSubtractSpec } from "@/components/nodes/Logic/ValueSubtractNode";
import { spec as logicMultiplySpec } from "@/components/nodes/Logic/ValueMultiplyNode";
import { spec as logicDivideSpec } from "@/components/nodes/Logic/ValueDivideNode";
import { spec as logicConditionSpec } from "@/components/nodes/Logic/ValueConditionNode";
import type { HandleRole } from "@/lib/handles";

type SpecLike = Pick<NodeSpec, "params" | "inputs" | "outputs">;

const SPEC_REGISTRY: Record<string, SpecLike> = {
    oscillator: oscillatorSpec,
    reverb: reverbSpec,
    speaker: speakerSpec,
    sequencer: sequencerSpec as unknown as SpecLike,
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
