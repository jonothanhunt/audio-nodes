"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export default function SidebarHeaderInfo() {
    const [modalOpen, setModalOpen] = useState(false);

    return (
        <div className="w-full flex items-center justify-between mb-2">
            <h1
                className="text-2xl text-white flex gap-1 align-middle items-center"
                style={{
                    fontFamily: "var(--font-lastik)",
                    fontWeight: 200,
                    fontVariationSettings: '"wght" 20',
                }}
            >
                <Link
                    href="/"
                    className="flex items-center gap-1 hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-purple-500/50 rounded"
                >
                    <span>Audio Nodes</span>
                    <span className="text-xl bg-purple-600 mb-1 px-1 pt-2 pb-1 rounded-md inline-flex items-center leading-none self-center h-fit">
                        alpha
                    </span>
                </Link>
            </h1>
            <button
                onClick={() => setModalOpen(true)}
                className="px-2 py-1 text-white hover:text-white/80 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 rounded-md"
                aria-label="App Info"
            >
                <span
                    style={{
                        fontFamily: "var(--font-lastik)",
                        fontWeight: 200,
                        fontVariationSettings: '"wght" 20',
                        fontStyle: 'italic',
                    }}
                    className="text-lg lowercase leading-none"
                >
                    info
                </span>
            </button>

            {modalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/70 backdrop-blur-xl">
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-xl max-w-sm w-[90%] relative">
                        <button
                            onClick={() => setModalOpen(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-white"
                            aria-label="Close"
                        >
                            ✕
                        </button>

                        <h2
                            className="text-2xl text-white flex gap-1 align-middle items-center mb-4"
                            style={{
                                fontFamily: "var(--font-lastik)",
                                fontWeight: 200,
                                fontVariationSettings: '"wght" 20',
                            }}
                        >
                            <span>Audio Nodes</span>
                            <span className="text-lg bg-purple-600 mb-1 px-1 pt-2 pb-1 rounded-md inline-flex items-center leading-none self-center">
                                alpha
                            </span>
                        </h2>

                        <div className="text-sm text-gray-300 mb-6 space-y-4">
                            <p>
                                Hey! Thanks for giving Audio Nodes a try.
                            </p>
                            <p>
                                This is very much work in progress, so expect some funny behaviour!
                            </p>
                            <p>You can learn more about the project on the <a href="https://github.com/jonothanhunt/audio-nodes#readme">GitHub repo</a>.</p>
                            <p>
                                Jonothan.dev
                            </p>
                        </div>

                        <nav className="flex flex-col gap-3 font-medium">
                            <Link
                                href="/help"
                                className="text-gray-300 hover:text-white transition-colors bg-gray-700/50 hover:bg-gray-700 rounded-lg p-3 text-center"
                                onClick={() => setModalOpen(false)}
                            >
                                Help & Documentation
                            </Link>
                            <a
                                href="https://github.com/jonothanhunt/audio-nodes#readme"
                                className="text-gray-300 hover:text-white transition-colors flex items-center justify-center gap-2 bg-gray-700/50 hover:bg-gray-700 rounded-lg p-3"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <span>GitHub Repository</span>
                                <ArrowUpRight className="w-4 h-4 opacity-80" />
                            </a>
                            <a
                                href="https://jonothan.dev"
                                className="text-gray-300 hover:text-white transition-colors flex items-center justify-center gap-2 bg-gray-700/50 hover:bg-gray-700 rounded-lg p-3"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <span>jonothan.dev</span>
                                <ArrowUpRight className="w-4 h-4 opacity-80" />
                            </a>
                        </nav>
                    </div>
                </div>
            )}
        </div>
    );
}
