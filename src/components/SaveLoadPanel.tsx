"use client";

import React from "react";

interface Props {
    onSave: () => void;
    onLoadObject: (obj: unknown) => void;
    onLoadDefault: () => void | Promise<boolean>;
}

export default function SaveLoadPanel({
    onSave,
    onLoadObject,
    onLoadDefault,
}: Props) {
    const fileInputRef = React.useRef<HTMLInputElement | null>(null);
    const menuRef = React.useRef<HTMLDivElement | null>(null);
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);

    const handleLoadFile = React.useCallback(
        (file: File) => {
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const obj = JSON.parse(
                        String(reader.result || "{}"),
                    ) as unknown;
                    onLoadObject(obj);
                } catch (err) {
                    console.error("Failed to parse project file:", err);
                }
            };
            reader.readAsText(file);
        },
        [onLoadObject],
    );

    const onPickLoadFile = React.useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    // Close menu on outside click
    React.useEffect(() => {
        const onDocMouseDown = (e: MouseEvent) => {
            if (!isMenuOpen) return;
            const target = e.target as Node | null;
            if (
                menuRef.current &&
                target &&
                !menuRef.current.contains(target)
            ) {
                setIsMenuOpen(false);
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsMenuOpen(false);
        };
        document.addEventListener("mousedown", onDocMouseDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onDocMouseDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [isMenuOpen]);

    return (
        <div className="relative z-40 bg-gray-800/80 backdrop-blur-md rounded-xl p-3 shadow border border-gray-700/80">
            <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleLoadFile(f);
                    // Close after picking a file
                    setIsMenuOpen(false);
                    // reset the input so picking the same file again works
                    if (fileInputRef.current) fileInputRef.current.value = "";
                }}
            />
            <div className="grid grid-cols-2 gap-2">
                <button
                    onClick={onSave}
                    className="px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-white text-sm w-full"
                    title="Download project (.json)"
                >
                    Save
                </button>
                {/* Load dropdown */}
                <div className="relative" ref={menuRef}>
                    <button
                        onClick={() => setIsMenuOpen((v) => !v)}
                        className="px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-white text-sm w-full flex items-center justify-center gap-1"
                        title="Load options"
                        aria-haspopup="menu"
                        aria-expanded={isMenuOpen}
                    >
                        Load
                        <span className="text-gray-300">▾</span>
                    </button>
                    {isMenuOpen && (
                        <div
                            role="menu"
                            className="absolute right-0 mt-2 w-44 rounded-md border border-gray-700/80 bg-gray-800/95 backdrop-blur-md shadow-lg z-50 overflow-hidden"
                        >
                            <button
                                role="menuitem"
                                onClick={() => {
                                    void onLoadDefault();
                                    setIsMenuOpen(false);
                                }}
                                className="block w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-700/80"
                            >
                                Load Default
                            </button>
                            <button
                                role="menuitem"
                                onClick={() => {
                                    onPickLoadFile();
                                }}
                                className="block w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-700/80"
                            >
                                Load File…
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
