import Link from "next/link";

export default function AboutPage() {
    return (
        <div className="min-h-screen w-full bg-gray-900 text-white">
            <div className="max-w-4xl mx-auto px-6 py-24">
                <div className="flex items-center justify-between mb-6">
                    <h1
                        className="text-4xl"
                        style={{
                            fontFamily: "var(--font-lastik)",
                            fontWeight: 200,
                            fontVariationSettings: '"wght" 20',
                        }}
                    >
                        About
                    </h1>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-white/90 hover:text-white text-2xl"
                        aria-label="Back to home"
                    >
                        <svg
                            className="w-5 h-5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <path d="M19 12H5" />
                            <path d="m12 19-7-7 7-7" />
                        </svg>
                        <span className="title-font">Back</span>
                    </Link>
                </div>
                <div className="bg-gray-800/70 border border-gray-700 rounded-xl p-6">
                    <p className="text-sm text-gray-300">
                        Hey! Thanks for trying out Audio Nodes! This is an
                        experimental project right now, mostly as an opportunity
                        for me to learn more about{" "}
                        <a
                            href="https://developer.mozilla.org/en-US/docs/WebAssembly"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline text-blue-400 hover:text-blue-300"
                        >
                            WebAssembly
                        </a>{" "}
                        and Rust.
                        <br />
                        <br />
                    </p>
                </div>
            </div>
        </div>
    );
}
