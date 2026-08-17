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

### ☐ A1. Speaker volume and mute are stepped, not ramped
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

**Planned fix:** per-sample interpolation from the previous block's gain to the target, plus a
one-pole smoother so mute/unmute becomes a short fade. Implemented as a shared
`SmoothedGain` helper in the worklet.

### ☐ A2. Master gain is set with `.value =`
`AudioManager.updateMasterGainVolume` did `this.masterGain.gain.value = 0 or 1`. An
`AudioParam` assignment takes effect immediately with no ramp, so both the user mute
button and the recording-preview mute click.

**Planned fix:** `setTargetAtTime` with a ~15 ms time constant, cancelling any in-flight ramp
first.

### ☐ A3. Nodes enter and leave the mix at full amplitude
When an edge is connected or a node is added, its output appears in the sum at whatever
instantaneous value its waveform happens to be at. Disconnecting is worse: the signal
truncates mid-cycle, and for a reverb the tail is cut dead because the WASM instance is
freed in the same message handler.

This is the "popping when starting/stopping things" the report is really about — it fires
on every patch change, which is constantly during normal use.

**Planned fix:** each audio-producing node carries a `SmoothedGain` envelope. Newly-reachable
nodes fade in over ~8 ms; nodes that stop being reachable fade out over ~8 ms and are only
then dropped from the render plan. Instance teardown is deferred until the fade completes,
so reverb tails ring out instead of being chopped.

### ☐ A4. Synth retrigger and voice stealing hard-reset the envelope
`SynthNode::note_on` did `v.env = 0.0` and `v.core.phase = 0.0` in all three branches —
including when reusing a voice that is currently sounding at sustain level, and when
stealing the quietest active voice. Dropping a live voice from 0.7 to 0.0 in one sample is
a click, and the phase reset adds a second discontinuity.

**Planned fix:** retrigger keeps the current envelope value and re-gates instead of zeroing.
Stealing goes through a `Stealing` voice state that ramps the old note out over ~2 ms
before the new note takes the voice. Phase is only reset when the voice was actually
silent.

### ☐ A5. Voice-count normalisation pumps the whole mix
```rust
let target = if voices_on > 0 { 1.0 / voices_on as f32 } else { 1.0 };
self.mix_gain += (target - self.mix_gain) * a;
```

Normalising by the live voice count means **every note on or off changes the loudness of
every other sounding note.** Playing a 4-note chord one note at a time ducks the earlier
notes to a quarter of their level. The 5 ms smoothing does not hide it — it just turns the
step into a fast swell. This is heard as breathing/pumping rather than a click, and it is
why chords feel unstable.

**Planned fix:** replace dynamic normalisation with a fixed headroom scale plus a soft clipper, so
each voice keeps a constant level and the sum is tamed by saturation instead of gain
riding.

### ☐ A6. Zero-length envelope stages snap
`if self.release <= 0.0 { v.env = 0.0; }` (and the same for attack/decay) lets a
UI value of 0 produce an instantaneous jump.

**Planned fix:** clamp attack/decay/release to a 1.5 ms floor. Still effectively instant musically,
but band-limited.

### ☐ A7. Oscillator amplitude and frequency jump per block
`_processOscillator` assigned `osc.amplitude` / `osc.frequency` straight from the
(possibly LFO-modulated) value each block. Amplitude steps click; frequency steps produce
a phase-slope discontinuity that is audible on low notes.

**Planned fix:** both are smoothed inside the Rust node, per sample, toward the block's target.

### ☐ A8. Reverb parameter changes are stepped
`rev.feedback` / `rev.wet_mix` were assigned per block. Changing wet mix while audio flows
steps the dry/wet balance.

**Planned fix:** smoothed per sample inside `ReverbNode::process`.

### ☐ A9. `startRecording` double-connects the worklet
```ts
this.audioWorklet.connect(this.audioContext.destination);
```
The worklet is already connected via `masterGain`. Adding a second path means the moment
recording starts the output jumps +6 dB **and** the extra path bypasses mute entirely, so
muting does nothing while recording. Not a click as such, but a very audible level jump at
exactly the moment you least want one.

**Planned fix:** deleted. Capture is taken from the worklet's `captureBlock` messages, so no extra
routing is needed.

---

## B. Correctness bugs in the render path

### ☐ B1. Fan-out renders a node twice, doubling its pitch
`_processGraph` called `_processInputNode(..., new Set())` per speaker input, and
`_processReverb` passed its own `visited` down. A node feeding two destinations is
therefore rendered twice in one block, and because oscillator/synth phase is stateful,
**its phase advances twice per quantum — the note sounds an octave up.** Patch an
oscillator into both a reverb and the speaker directly and it goes sharp.

**Planned fix:** a per-block render cache. Each node renders at most once per quantum into a
pooled buffer; extra consumers read the cached buffer.

### ☐ B2. Nested reverbs corrupt each other's input buffer
`_processReverb` accumulated its input into the single shared `this._scratch.inL/inR`.
Reverb → reverb means the inner call runs `inL.fill(0)` and wipes what the outer call had
already summed, so the outer reverb processes only part of its input.

**Planned fix:** the scratch buffers became a pooled stack (`_acquireBuffer` / `_releaseBuffer`),
so each recursion level gets its own.

### ☐ B3. MIDI events are quantised to the block boundary
`_processSynthMIDI` ignores `atFrame` / `atTimeMs` and applies every event at the start of
the block. `_resolveEventFrame` exists and is computed but its result is never used. Live
playing and sequencer steps are therefore quantised to 128 samples (2.9 ms at 44.1 kHz),
with the error varying per event — audible as timing looseness on fast material rather
than as a click.

**Planned fix:** split synth rendering at event frames, and give sequencer/arp steps
sub-block frame offsets.

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

### ☐ C1. The graph is re-derived from scratch every block
Per quantum, the old `process()` did:

- `Array.from(this._nodes.entries()).filter(...)` to find LFO nodes — two allocations
- `this._connections.filter(...)` in `_processGraph`, once per speaker
- `this._connections.filter(...)` in `_processReverb`, once per reverb
- `this._connections.filter(...)` in `_broadcastSequencerMIDI` / `_broadcastArpMIDI`
- `new Set()` per speaker input for cycle detection
- `this._paramConnections.filter(...)` in `_applyParamModulations`, once per node

**Planned fix:** a render plan (`_rebuildRenderPlan`) computed once when nodes or connections
change, holding the topologically-ordered node list, per-node input arrays, and per-node
param-modulation lists. `process()` now walks pre-built arrays.

### ☐ C2. `_applyParamModulations` allocates two objects per node per block
It built a `modAccum` record and then `{ ...data, ...modAccum }`. For a graph with a
handful of modulated nodes that is thousands of short-lived objects per second.

**Planned fix:** modulated values are written into a persistent per-node scratch object that is
reused across blocks.

### ☐ C3. `_propagateValueNodes` spreads and re-inserts nodes up to 4× per block
```ts
this._nodes.set(id, { ...node, value: newValue });
```
inside a 4-pass fixpoint loop, every block, for every value/logic node. This was the
single largest allocator in the file.

**Planned fix:** values are mutated in place, and the fixpoint only runs when an input actually
changed. The pass order comes from the render plan's topological sort, so one pass
usually suffices.

### ☐ C4. `modPreview` floods the main thread
Both `_applyParamModulations` and `_propagateValueNodes` posted a `modPreview` message
**every block per modulated node** — ~344 messages/sec each. On the main thread
`AudioManager` then allocated a `CustomEvent` per message and dispatched it to every
`useLiveParamModulation` subscriber, each of which filters by `nodeId` in JS and calls
`setValue` → React re-render. With a few modulated params this is a self-inflicted
re-render storm, and it competes with the very thread that has to service the audio graph.

**Planned fix:** coalesce all preview values into one batched message and throttle to ~30 Hz,
which is well past what the eye resolves on a number readout.

### ☐ C5. Dragging a node re-pushes the entire graph to the worklet
`useNodeSync` pushes **every node** on any change to `nodes`:

```ts
nodes.forEach(node => audioManager.updateNode(node.id, { type: node.type, ...node.data }));
```

React Flow emits a position change per pointer-move while dragging, so a 20-node graph
sends ~1,200 `updateNode` messages/sec. Each one runs `GraphSync.sanitizeForPostMessage`
(a full recursive clone with a fresh `WeakSet`), gets structured-cloned across the thread
boundary, and the worklet replies with an `ackNode` message that **nothing consumes**.
This is why interacting with the canvas makes the audio crackle.

**Planned fix:** `useNodeSync` diffs each node's audio-relevant data and skips nodes whose data is
unchanged (position moves no longer touch the audio thread at all); `GraphSync` keeps a
signature per node and drops redundant posts; the unused `ack*` replies are gone.

### ☐ C6. Unused `ack*` chatter
`ackNode`, `ackRemove`, `ackConnections`, `ackClear`, `ackBootstrap` are posted by the
worklet and read by nobody.

**Planned fix:** removed.

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
