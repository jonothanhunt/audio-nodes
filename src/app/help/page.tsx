import Link from "next/link";

export default function HelpPage() {
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
                        Help / Quick Start
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

                <div className="space-y-6">
                    <section className="bg-gray-800/70 border border-gray-700 rounded-xl p-6">
                        <h2 className="text-xl mb-2">What is Audio Nodes?</h2>
                        <p className="text-sm text-gray-300">
                            Audio Nodes is a node-based editor for building
                            simple audio graphs in your browser. You create
                            small building blocks (nodes) like oscillators,
                            effects, and sequencers, then connect them to define
                            signal flow.
                        </p>
                    </section>

                    <section className="bg-gray-800/70 border border-gray-700 rounded-xl p-6">
                        <h2 className="text-xl mb-3">Core Concepts</h2>
                        <ul className="list-disc list-inside text-sm text-gray-300 space-y-1.5">
                            <li>
                                <span className="text-gray-400">Nodes:</span>{" "}
                                Functional blocks (e.g., Oscillator, Reverb,
                                Sequencer, Synth, Speaker).
                            </li>
                            <li>
                                <span className="text-gray-400">
                                    Inputs/Outputs:
                                </span>{" "}
                                Nodes expose inputs and outputs for audio or
                                MIDI. Connect compatible types.
                            </li>
                            <li>
                                <span className="text-gray-400">
                                    Connections:
                                </span>{" "}
                                Drag from a node’s handle to another node’s
                                matching handle to create an edge.
                            </li>
                            <li>
                                <span className="text-gray-400">
                                    Parameters:
                                </span>{" "}
                                Each node has tunable controls. Adjust values to
                                change how it behaves.
                            </li>
                        </ul>
                    </section>

                    <section className="bg-gray-800/70 border border-gray-700 rounded-xl p-6">
                        <h2 className="text-xl mb-3">Quick Start</h2>
                        <ol className="list-decimal list-inside text-sm text-gray-300 space-y-1.5">
                            <li>
                                Add a node from the library (left panel). Try an
                                Oscillator and a Speaker.
                            </li>
                            <li>
                                Connect the Oscillator’s Audio Out to the
                                Speaker’s Audio In.
                            </li>
                            <li>
                                Click “Start Audio” if prompted. Adjust
                                oscillator waveform and frequency.
                            </li>
                            <li>
                                Add a Reverb between Oscillator and Speaker for
                                ambience.
                            </li>
                            <li>
                                Try MIDI: Add a Sequencer → Synth → Speaker
                                chain and press Play on the Sequencer.
                            </li>
                        </ol>
                    </section>

                    <section className="bg-gray-800/70 border border-gray-700 rounded-xl p-6">
                        <h2 className="text-xl mb-3">Tips</h2>
                        <ul className="list-disc list-inside text-sm text-gray-300 space-y-1.5">
                            <li>
                                Use the “?” button on each node for a quick
                                description of inputs/outputs.
                            </li>
                            <li>
                                Zoom/pan with trackpad or mouse; drag nodes by
                                their body (UI controls won’t interfere).
                            </li>
                            <li>
                                Save/Load your project in the left panel.
                                Default project loads on first visit.
                            </li>
                            <li>
                                Web MIDI works in secure contexts (https). If
                                denied, allow MIDI access in your browser.
                            </li>
                        </ul>
                    </section>
                </div>
            </div>
        </div>
    );
}
