export type ParamKind = 'number' | 'bool' | 'select' | 'text';

export interface BaseParamSpec<K extends ParamKind = ParamKind> {
  key: string;
  kind: K;
  label?: string; // default: capitalized key
  default: unknown; // refined per kind
  description?: string;
  hidden?: boolean;
  badge?: string; // unit or short tag
  handle?: boolean; // whether to expose a param-in handle (default true)
}

export interface NumberParamSpec extends BaseParamSpec<'number'> {
  default: number;
  min?: number;
  max?: number;
  step?: number;
}
export interface BoolParamSpec extends BaseParamSpec<'bool'> {
  default: boolean;
}
export interface SelectParamSpec extends BaseParamSpec<'select'> {
  default: string;
  options: string[]; // static for now
}
export interface TextParamSpec extends BaseParamSpec<'text'> {
  default: string;
  placeholder?: string;
}

export type ParamSpec = NumberParamSpec | BoolParamSpec | SelectParamSpec | TextParamSpec;

export interface IOHandleSpec {
  id: string; // unique handle id
  role: 'audio-in' | 'audio-out' | 'midi-in' | 'midi-out' | 'param-out';
  label: string;
}

export interface NodeSpec {
  type: string;
  title?: string; // optional; registry displayName used if absent
  accentColor?: string; // deprecated: prefer registry category color
  // params: Scalar control values (number/bool/select/text). Each param can optionally expose a
  // param-handle (handle=true) so another node can modulate it. These are NOT streaming data;
  // they change discretely and are forwarded to the engine via onParameterChange.
  params: ParamSpec[];
  // inputs/outputs: Streaming signal endpoints (audio or MIDI). Only these participate in the
  // continuous render / scheduling paths. Keeping them separate from params keeps layout simpler
  // and avoids conflating a one-off value update with a continuous data flow.
  // If desired we could unify these into a single 'ports' array with kind: 'audio-in' | 'midi-in' |
  // 'param-in' etc., but current split keeps scalar vs streaming responsibilities distinct.
  inputs?: IOHandleSpec[]; // streaming inputs (audio/midi)
  outputs?: IOHandleSpec[]; // streaming outputs (audio/midi)
  category?: string; // deprecated (registry supplies)
  description?: string; // deprecated (registry supplies)
  docsUrl?: string; // optional external docs link
  help?: {
    description: string;
    inputs: { name: string; description: string }[];
    outputs: { name: string; description: string }[];
  };
  // Whether to draw param input handles for each param (default true). Some nodes (e.g. MIDI In)
  // are controlled only via internal UI and shouldn't expose param handles.
  paramHandles?: boolean;
  // Allow custom content injection points
  renderBeforeParams?: (ctx: NodeRenderContext) => React.ReactNode;
  renderAfterParams?: (ctx: NodeRenderContext) => React.ReactNode;
}

export interface ParamRuntime<T = unknown> {
  spec: ParamSpec;
  value: T;
  connected: boolean;
  set: (v: T) => void;
}

export interface NodeRenderContext {
  id: string;
  data: Record<string, unknown>;
  params: ParamRuntime[];
  update: (key: string, value: unknown) => void;
}

// Note: Individual node specs (params, IO, help) should live in their node component files
// to keep node-specific logic co-located. This shared file only defines the types.
