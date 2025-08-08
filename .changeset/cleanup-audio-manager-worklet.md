---
'audio-nodes-v3': patch
---

- Remove legacy ScriptProcessor-related fields and unused helpers from `AudioManager`.
- Deprecate `useWasm` hook; WASM now loads inside the AudioWorklet.
- Keep essential startup logs and graph update logs for debugging.
