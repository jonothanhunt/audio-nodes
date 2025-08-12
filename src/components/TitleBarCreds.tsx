"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export default function TitleBarCreds() {
    return (
        <div className="w-full flex items-center justify-between">
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
                        beta
                    </span>
                </Link>
            </h1>
            <nav
                className="flex items-center gap-4"
                style={{
                    fontFamily: "var(--font-lastik)",
                    fontWeight: 200,
                    fontVariationSettings: '"wght" 20',
                }}
            >
                <Link
                    href="/help"
                    className="text-lg text-white/85 hover:text-white transition-colors"
                >
                    help
                </Link>
                <Link
                    href="/about"
                    className="text-lg text-white/85 hover:text-white transition-colors"
                >
                    about
                </Link>
                <Link
                    href="https://jonothan.dev"
                    className="text-lg text-white/85 hover:text-white transition-colors inline-flex items-center gap-1"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <span>jonothan.dev</span>
                    <ArrowUpRight
                        className="w-3.5 h-3.5 opacity-80"
                        aria-hidden="true"
                    />
                </Link>
            </nav>
        </div>
    );
}
