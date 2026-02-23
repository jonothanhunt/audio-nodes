"use client";
import dynamic from "next/dynamic";

const AudioNodesEditor = dynamic(() => import("@/components/editor/AudioNodesEditor"), {
    ssr: false,
});

export default function Home() {
    return <AudioNodesEditor />;
}
