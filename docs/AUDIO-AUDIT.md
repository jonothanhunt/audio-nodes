# Audio engine audit — clicks, pops, and performance

Findings from a read-through of `core-audio/wasm`, `core-audio/worklet`,
`core-audio/client`, and the React sync layer. Ordered roughly by how much each one
contributes to the "popping when starting/stopping things" symptom.

The recurring theme: **the engine has almost no gain smoothing and no per-block work
budget.** Every gain is applied as a raw multiply that can jump between blocks, and the
render path re-derives the graph from scratch (with allocations) on every 128-sample
quantum. Both show up as audible artefacts — the first as clicks, the second as
crackle/dropouts under interaction.

Status legend: ☐ open · ☑ fixed · ◐ partially addressed

---

## A. Discontinuities that produce clicks and pops

### ☑ A1. Speaker volume and mute are stepped, not ramped
`_processGraph` computed one gain per block and multiplied:

```ts
let gain = 1.0;
if (typeof data.volume === "number") gain = data.volume;
if (data.muted) gain = 0;
for (let i = 0; i < N; i++) outL[i] += sumL[i] * gain;
```

A mute is therefore a full-scale step to zero on a block boundary — the single loudest
click in the app — and dragging the volume slider produces a stair-step of ~344 gain
changes per second (classic zipper noise).

**Fix:** per-sample interpolation from the previous block's gain to the target, plus a
one-pole smoother so mute/unmute becomes a short fade. Implemented as a shared
`SmoothedGain` helper in the worklet.

### ☑ A2. Master gain is set with `.value =`
`AudioManager.updateMasterGainVolume` did `this.masterGain.gain.value = 0 or 1`. An
`AudioParam` assignment takes effect immediately with no ramp, so both the user mute
button and the recording-preview mute click.

**Fix:** `setTargetAtTime` with a ~15 ms time constant, cancelling any in-flight ramp
first.

### ☑ A3. Nodes enter and leave the mix at full amplitude
When an edge is connected or a node is added, its output appears in the sum at whatever
instantaneous value its waveform happens to be at. Disconnecting is worse: the signal
truncates mid-cycle, and for a reverb the tail is cut dead because the WASM instance is
freed in the same message handler.

This is the "popping when starting/stopping things" the report is really about — it fires
on every patch change, which is constantly during normal use.

**Fix:** each audio-producing node carries a `SmoothedGain` envelope. Newly-reachable
nodes fade in over ~8 ms; nodes that stop being reachable fade out over ~8 ms and are only
then dropped from the render plan. Instance teardown is deferred until the fade completes,
so reverb tails ring out instead of being chopped.

### ☑ A4. Synth retrigger and voice stealing hard-reset the envelope
`SynthNode::note_on` did `v.env = 0.0` and `v.core.phase = 0.0` in all three branches —
including when reusing a voice that is currently sounding at sustain level, and when
stealing the quietest active voice. Dropping a live voice from 0.7 to 0.0 in one sample is
a click, and the phase reset adds a second discontinuity.

**Fix:** retrigger keeps the current envelope value and re-gates instead of zeroing.
Stealing goes through a `Stealing` voice state that ramps the old note out over ~2 ms
before the new note takes the voice. Phase is only reset when the voice was actually
silent.

### ☑ A5. Voice-count normalisation pumps the whole mix
```rust
let target = if voices_on > 0 { 1.0 / voices_on as f32 } else { 1.0 };
self.mix_gain += (target - self.mix_gain) * a;
```

Normalising by the live voice count means **every note on or off changes the loudness of
every other sounding note.** Playing a 4-note chord one note at a time ducks the earlier
notes to a quarter of their level. The 5 ms smoothing does not hide it — it just turns the
step into a fast swell. This is heard as breathing/pumping rather than a click, and it is
why chords feel unstable.

**Fix:** replace dynamic normalisation with a fixed headroom scale plus a soft clipper, so
each voice keeps a constant level and the sum is tamed by saturation instead of gain
riding.

### ☑ A6. Zero-length envelope stages snap
`if self.release <= 0.0 { v.env = 0.0; }` (and the same for attack/decay) lets a
UI value of 0 produce an instantaneous jump.

**Fix:** clamp attack/decay/release to a 1.5 ms floor. Still effectively instant musically,
but band-limited.

### ☑ A7. Oscillator amplitude and frequency jump per block
`_processOscillator` assigned `osc.amplitude` / `osc.frequency` straight from the
(possibly LFO-modulated) value each block. Amplitude steps click; frequency steps produce
a phase-slope discontinuity that is audible on low notes.

**Fix:** both are smoothed inside the Rust node, per sample, toward the block's target.

### ☑ A8. Reverb parameter changes are stepped
`rev.feedback` / `rev.wet_mix` were assigned per block. Changing wet mix while audio flows
steps the dry/wet balance.

**Fix:** smoothed per sample inside `ReverbNode::process`.

### ☑ A9. `startRecording` double-connects the worklet
```ts
this.audioWorklet.connect(this.audioContext.destination);
```
The worklet is already connected via `masterGain`. Adding a second path means the moment
recording starts the output jumps +6 dB **and** the extra path bypasses mute entirely, so
muting does nothing while recording. Not a click as such, but a very audible level jump at
exactly the moment you least want one.

**Fix:** deleted. Capture is taken from the worklet's `captureBlock` messages, so no extra
routing is needed.

---

## B. Correctness bugs in the render path

### ☑ B1. Fan-out renders a node twice, doubling its pitch
`_processGraph` called `_processInputNode(..., new Set())` per speaker input, and
`_processReverb` passed its own `visited` down. A node feeding two destinations is
therefore rendered twice in one block, and because oscillator/synth phase is stateful,
**its phase advances twice per quantum — the note sounds an octave up.** Patch an
oscillator into both a reverb and the speaker directly and it goes sharp.

**Fix:** a per-block render cache. Each node renders at most once per quantum into a
pooled buffer; extra consumers read the cached buffer.

### ☑ B2. Nested reverbs corrupt each other's input buffer
`_processReverb` accumulated its input into the single shared `this._scratch.inL/inR`.
Reverb → reverb means the inner call runs `inL.fill(0)` and wipes what the outer call had
already summed, so the outer reverb processes only part of its input.

**Fix:** the scratch buffers became a pooled stack (`_acquireBuffer` / `_releaseBuffer`),
so each recursion level gets its own.

### ☑ B3. MIDI events were quantised to the block boundary
`_processSynthMIDI` ignored `atFrame` / `atTimeMs` and applied every event at the start of
the block. `_resolveEventFrame` existed and was computed, and its result was then thrown
away. Live playing was therefore quantised to 128 samples (2.9 ms at 44.1 kHz), with the
error varying per event — audible as timing looseness on fast material rather than as a
click.

**Fix:** incoming events are staged against their resolved frame and the synth renders in
segments split at those frames, so a note lands on the sample it was scheduled for.
Arpeggiator steps now carry the sub-block frame they actually fell on, computed from the
leftover in the beat accumulator. Events for a synth with no audio path are still applied
(rather than dropped) so note state stays coherent if it is patched in while a key is held.

### ☐ B6. Sequencer steps make a round trip through React
This one dwarfs B3 and was found while fixing it.

The worklet detects a sequencer step and posts `sequencerStep` to the main thread.
`SequencerNode` receives it in a `useEffect`, works out which notes changed, and calls
`onEmitMidi` — which posts the notes *back* to the worklet, with no timing information
attached. So every sequencer note is: audio thread → main thread → React render → audio
thread, and lands at whatever block boundary it happens to arrive on.

Block quantisation is 2.9 ms. A main-thread round trip through a React render is tens of
milliseconds under load, and it varies with whatever else the page is doing — so sequencer
timing is at the mercy of UI work. Every fix in section C reduces main-thread load and so
tightens this indirectly, but the jitter is structural.

**Planned fix:** let the worklet emit sequencer notes itself, the way it already does for
the arpeggiator. It has everything it needs — the step grid, `fromNote`/`toNote` and
`length` all arrive via `updateNode` already. The `sequencerStep` message stays, but purely
to drive the UI's step highlight, where late delivery is invisible. This is a behavioural
change to how patterns are played, so it is worth agreeing before building.

### ☑ B7. The shipped default project had an unrenderable edge
`public/projects/default-project.json` wired its first Sequencer to a Synth with
`sourceHandle: "midi"`, but the Sequencer's `NodeSpec` declares its output handle as
`midi-out` (`midi` is the *Synth's input* id). React Flow refuses to draw an edge whose
source handle does not exist and logs error #008, so that cable was invisible on first load
— while the audio engine, which accepts either spelling, still made the connection. A patch
that plays but shows no cable reads as a rendering bug.

**Fix:** corrected the handle id in the project file. Worth noting the underlying trap: MIDI
input handles are spelled `midi` on the Synth but `midi-in` on the Arpeggiator, and outputs
are `midi-out` on both. Normalising those ids would prevent a repeat, but it would also
invalidate the edges in any project users have already saved, so it needs a migration rather
than a rename.

### ☐ B5. Three Synth controls are wired to nothing
The Synth node's `NodeSpec` declares **Cutoff** (20–20000 Hz), **Resonance** (0–1) and a
**Preset** select (Init/Pluck/Pad/Bass), and `NodeHelpPopover` documents Cutoff/Resonance as
"filter frequency and resonance". Nothing forwards any of them: there are zero references to
`cutoff`, `resonance` or `preset` in the worklet or in the Rust crate, and `SynthNode` has no
filter and no preset handling at all. Dragging those sliders is silent, which reads as a bug
in the audio engine even though the engine never sees them.

Found by sweeping every node spec's declared param keys against what the worklet and the
Rust crate actually consume. The other flagged keys turned out to be legitimately
main-thread-only: `midi-input`'s `deviceId`/`channel` are applied by `useMidiAccess`,
`sequencer`'s `fromNote`/`toNote` build the grid's note range in the component, and
`logic-condition.dataType` / `value-select.options` are presentation only.

**Planned fix:** implement a state-variable filter in the DSP layer and wire it into
`SynthNode` per voice (or post-mix). This is the cheapest way to make two existing controls
real, and the same filter is the roadmap's standalone multi-mode Filter node — so it is
worth doing before the other roadmap items. Presets then become a main-thread concern: a
preset selection should write the individual param values.

### ☐ B4. Reverb is mono-only and a single comb filter
`rev.process(inL, temp)` uses the left channel as a mono input and writes the same signal
to both outputs; the whole graph is mono-duplicated despite the worklet declaring
`outputChannelCount: [2]`. The reverb itself is one 100 ms comb with feedback — metallic
and not really a reverb.

Cosmetic relative to the rest, but worth revisiting when the effects roadmap lands.

---

## C. Per-block cost in the audio thread

Anything allocating inside `process()` feeds the GC, and a GC pause in the audio callback
is a dropout. At 44.1 kHz the block rate is ~344 Hz, so every allocation below happens
344 times a second.

### ☑ C1. The graph is re-derived from scratch every block
Per quantum, the old `process()` did:

- `Array.from(this._nodes.entries()).filter(...)` to find LFO nodes — two allocations
- `this._connections.filter(...)` in `_processGraph`, once per speaker
- `this._connections.filter(...)` in `_processReverb`, once per reverb
- `this._connections.filter(...)` in `_broadcastSequencerMIDI` / `_broadcastArpMIDI`
- `new Set()` per speaker input for cycle detection
- `this._paramConnections.filter(...)` in `_applyParamModulations`, once per node

**Fix:** a render plan (`_rebuildRenderPlan`) computed once when nodes or connections
change, holding the topologically-ordered node list, per-node input arrays, and per-node
param-modulation lists. `process()` now walks pre-built arrays.

### ☑ C2. `_applyParamModulations` allocates two objects per node per block
It built a `modAccum` record and then `{ ...data, ...modAccum }`. For a graph with a
handful of modulated nodes that is thousands of short-lived objects per second.

**Fix:** modulated values are written into a persistent per-node scratch object that is
reused across blocks.

### ☑ C3. `_propagateValueNodes` spreads and re-inserts nodes up to 4× per block
```ts
this._nodes.set(id, { ...node, value: newValue });
```
inside a 4-pass fixpoint loop, every block, for every value/logic node. This was the
single largest allocator in the file.

**Fix:** values are mutated in place, and the fixpoint only runs when an input actually
changed. The pass order comes from the render plan's topological sort, so one pass
usually suffices.

### ☑ C4. `modPreview` floods the main thread
Both `_applyParamModulations` and `_propagateValueNodes` posted a `modPreview` message
**every block per modulated node** — ~344 messages/sec each. On the main thread
`AudioManager` then allocated a `CustomEvent` per message and dispatched it to every
`useLiveParamModulation` subscriber, each of which filters by `nodeId` in JS and calls
`setValue` → React re-render. With a few modulated params this is a self-inflicted
re-render storm, and it competes with the very thread that has to service the audio graph.

**Fix:** coalesce all preview values into one batched message and throttle to ~30 Hz,
which is well past what the eye resolves on a number readout.

### ☑ C5. Dragging a node re-pushes the entire graph to the worklet
`useNodeSync` pushes **every node** on any change to `nodes`:

```ts
nodes.forEach(node => audioManager.updateNode(node.id, { type: node.type, ...node.data }));
```

React Flow emits a position change per pointer-move while dragging, so a 20-node graph
sends ~1,200 `updateNode` messages/sec. Each one runs `GraphSync.sanitizeForPostMessage`
(a full recursive clone with a fresh `WeakSet`), gets structured-cloned across the thread
boundary, and the worklet replies with an `ackNode` message that **nothing consumes**.
This is why interacting with the canvas makes the audio crackle.

**Fix:** `useNodeSync` diffs each node's audio-relevant data and skips nodes whose data is
unchanged (position moves no longer touch the audio thread at all); `GraphSync` keeps a
signature per node and drops redundant posts; the unused `ack*` replies are gone.

### ☑ C6. Unused `ack*` chatter
`ackNode`, `ackRemove`, `ackConnections`, `ackClear`, `ackBootstrap` are posted by the
worklet and read by nobody.

**Fix:** removed.

### ◐ C7. Capture allocates two Float32Arrays per block
`startCapture` copies both channels into fresh arrays each quantum and transfers them.
Allocation is unavoidable if the buffers are transferred, but the churn could be reduced
by batching several quanta per message. Left as-is for now — it only applies while
recording, and the transfer means no copy on the main-thread side.

---

## D. UI / React render layer

`eslint-plugin-react-hooks` 7 (shipped with the Next 16 upgrade) applies the React
Compiler rule set and flags 16 real issues. They are currently set to `warn` in
`eslint.config.mjs` so they stay visible. None of them change audio behaviour, but they do
cause avoidable re-renders, which matters because the main thread also services the
worklet message port.

| Rule | Count | Files |
|---|---|---|
| `react-hooks/refs` — refs read during render | 10 | `NumberParam`, `SelectParam`, `TransportPill` |
| `react-hooks/set-state-in-effect` — cascading renders | 6 | `NumberParam`, `SequencerNode`, `RecordingPreviewModal`, `useLiveParamModulation`, `useMediaPipeHands` |

Two structural notes beyond the lint output:

- **`useLiveParamModulation` fans out through a global `window` event.** Every subscriber
  receives every node's update and filters in JS, so the cost is O(subscribers × messages).
  A `Map<nodeId, Set<callback>>` in `AudioManager` would make it O(1) per update. The
  `window.__MOD_PREVIEW_CACHE__` global is also doing the job of a proper store.
- **`attachHandlers` rewrites every node's `data` to inject callbacks**, which invalidates
  every node object and re-triggers the sync effect. Passing the callbacks through context
  instead of node data would remove a whole class of churn. `NodeUIProvider` already
  exists and looks like the right home.

Both are UI-internal — they do not change how anything looks or behaves.

---

## Verification

Two layers, both automated (`npm run test:all`):

- **81 vitest specs** drive the *compiled* worklet through its real message port, with
  stand-ins for the worklet globals and fake WASM nodes. The fake oscillator's sample
  counter doubles as its phase, which makes the B1 fan-out regression directly assertable.
- **35 native Rust tests** (`cargo test`, enabled by adding `rlib` to `crate-type`). Most
  assert a bound on the maximum sample-to-sample step of the output, which is the measurable
  form of "does not click".

On top of that, the engine was driven in a real Chromium instance against the compiled WASM,
capturing PCM out of the worklet and measuring it. That is the only way to confirm the
wasm-bindgen glue still bootstraps inside the worklet isolate, and it verifies the fixes
empirically rather than structurally:

| Measurement | Result | Reads as |
|---|---|---|
| Worklet + WASM bootstrap | ready, no errors | glue transform survives wasm-bindgen 0.2.127 |
| 440 Hz tone | 440.02 Hz measured | oscillator correct |
| Same tone with fan-out (direct + through a reverb) | 440.01 Hz | **B1 fixed** — was an octave up |
| Mute, max sample step | 0.046 vs 0.050 natural slope | **A1** — no step, fade only |
| Mute, tail | exactly 0.0 | reaches true silence |
| Disconnect, max sample step | 0.050 vs 0.050 natural slope | **A3** — no cut, fade only |
| Disconnect, tail | exactly 0.0 | fades out fully |
| One note / four-note chord peak | 0.24 → 0.67 | **A5** — chord no longer ducks the notes already sounding |
| Retrigger a held note, max step | 0.051 | **A4** — no click |
| Console + engine errors | none | — |

The editor UI was also checked after the `@xyflow/react` v12 migration: 8 nodes, 14 edges,
53 handles and the minimap all render, node dragging works, and there are no console errors.

---

## E. Repo / build notes — done

- `core-audio/wasm/target` was committed: 196 files, 44 MB. Untracked.
- `src/audio-engine-wasm/` was a stale duplicate of the generated bundle that nothing
  imported. Removed.
- `scripts/build-wasm.sh` used macOS-only `sed -i ''` and copied to a path that does not
  exist, so it could not have worked on Linux/CI. Rewritten.
- The Rust crate declared `js-sys` and `web-sys` (with a list of Web Audio features) but
  never used either. Removed, and a release profile with fat LTO added.
- `next.config.ts` carried a webpack `asyncWebAssembly` block for WASM that never goes
  through the bundler. Removed, which unblocked Turbopack.
