"use client";
import React from "react";
import { AudioManager } from "./audioManager";

const AudioManagerContext = React.createContext<AudioManager | null>(null);

interface Props {
    manager: AudioManager;
    children: React.ReactNode;
}

export function AudioManagerProvider({ manager, children }: Props) {
    return (
        <AudioManagerContext.Provider value={manager}>
            {children}
        </AudioManagerContext.Provider>
    );
}

/** Returns the nearest AudioManager instance from context. */
export function useAudioManager(): AudioManager {
    const ctx = React.useContext(AudioManagerContext);
    if (!ctx) throw new Error("useAudioManager must be used inside <AudioManagerProvider>");
    return ctx;
}
