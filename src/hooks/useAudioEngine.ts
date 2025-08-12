"use client";

import { useCallback, useEffect, useState } from "react";
import { AudioManager } from "@/lib/audioManager";

export function useAudioEngine() {
    const [audioManager] = useState(() => new AudioManager());
    const [audioInitialized, setAudioInitialized] = useState(false);
    const [wasmReady, setWasmReady] = useState(false);

    // Poll for WASM readiness
    useEffect(() => {
        const checkWasmReady = () => {
            const ready = audioManager.isReady();
            if (ready !== wasmReady) {
                setWasmReady(ready);
            }
        };

        checkWasmReady();
        if (!wasmReady) {
            const interval = setInterval(checkWasmReady, 100);
            return () => clearInterval(interval);
        }
    }, [audioManager, wasmReady]);

    const initializeAudio = useCallback(async () => {
        try {
            const success = await audioManager.initializeAudio();
            if (success) {
                setAudioInitialized(true);
            }
            return success;
        } catch (error) {
            console.error("Error initializing audio:", error);
            return false;
        }
    }, [audioManager]);

    const sendMIDI = useCallback(
        (
            sourceId: string,
            events: Array<{
                data: [number, number, number];
                atFrame?: number;
                atTimeMs?: number;
            }>,
        ) => {
            audioManager.sendMIDI(sourceId, events);
        },
        [audioManager],
    );

    return {
        audioManager,
        audioInitialized,
        initializeAudio,
        wasmReady,
        sendMIDI,
    } as const;
}
