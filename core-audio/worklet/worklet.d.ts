/**
 * Ambient type declarations for the AudioWorklet global scope.
 *
 * These globals exist inside the AudioWorkletGlobalScope V8 isolate
 * but are NOT part of the standard lib.dom.d.ts shipped with TypeScript.
 */

/** Sample rate of the AudioContext that owns this worklet. */
declare let sampleRate: number;

/** Current frame index of the audio context (read-only). */
declare let currentFrame: number;

/** Current time of the audio context in seconds (read-only). */
declare let currentTime: number;

/** Register an AudioWorkletProcessor class under a name. */
declare function registerProcessor(
    name: string,
    processorCtor: typeof AudioWorkletProcessor,
): void;

interface MessageEvent {
    data: unknown;
    origin: string;
    lastEventId: string;
    source: unknown;
    ports: MessagePort[];
}

interface MessagePort {
    postMessage(message: unknown, transfer?: Transferable[]): void;
    onmessage: ((this: MessagePort, ev: MessageEvent) => unknown) | null;
    start(): void;
    close(): void;
}

/** Base class for audio worklet processors. */
declare class AudioWorkletProcessor {
    /** MessagePort for bidirectional communication with the main thread. */
    readonly port: MessagePort;

    constructor();

    /**
     * Called by the audio rendering thread for each audio block.
     * Return `true` to keep the processor alive, or `false` to free it.
     */
    process(
        inputs: Float32Array[][],
        outputs: Float32Array[][],
        parameters: Record<string, Float32Array>,
    ): boolean;
}
