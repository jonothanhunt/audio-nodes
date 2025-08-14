import React from "react";
import { Search } from "lucide-react";
import { NODE_CATEGORIES } from "@/lib/nodeRegistry";

interface NodeLibraryProps {
    onAddNode: (type: string) => void;
}

export default function NodeLibrary({ onAddNode }: NodeLibraryProps) {
    const [searchTerm, setSearchTerm] = React.useState("");
    const [selectedCategory, setSelectedCategory] = React.useState("All");

    const categories = React.useMemo(
        () => ["All", ...NODE_CATEGORIES.map((c) => c.name)],
        []
    );

    return (
        <div className="w-full h-full flex flex-col">
            <div className="mb-3">
                <div className="relative mb-3">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Search nodes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    />
                </div>
                <div className="flex flex-wrap gap-1">
                    {categories.map((category) => (
                        <button
                            key={category}
                            onClick={() => setSelectedCategory(category)}
                            className={`px-2 py-1 text-xs rounded ${
                                selectedCategory === category
                                    ? "bg-purple-600 text-white"
                                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                            }`}
                        >
                            {category}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
                {NODE_CATEGORIES.map((cat) => {
                    if (selectedCategory !== "All" && selectedCategory !== cat.name) return null;
                    const visible = cat.nodes.filter((d) => d.name.toLowerCase().includes(searchTerm.toLowerCase()));
                    if (!visible.length) return null;
                    return (
                        <div key={cat.name}>
                            <h3 className="text-xs font-medium text-gray-400 mb-2 tracking-wide uppercase">{cat.name}</h3>
                            <div className="space-y-2">
                                {visible.map((d) => {
                                    const Icon = d.icon;
                                    const borderColor = cat.color + '4D'; // ~30% opacity
                                    const gradientFrom = cat.color + '1A'; // ~10% opacity
                                    return (
                                        <button
                                            key={d.type}
                                            onClick={() => onAddNode(d.type)}
                                            className={`relative w-full p-3 rounded-lg border bg-gray-900 shadow-lg transition-colors hover:border-white/40`}
                                            style={{ borderColor }}
                                        >
                                            <div
                                                className={`pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent to-transparent rounded-lg`}
                                                style={{ background: `linear-gradient(135deg, ${gradientFrom}, transparent 65%)` }}
                                            />
                                            <div className="relative flex items-start gap-3">
                                                <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5`} style={{ color: cat.color }} />
                                                <div className="flex-1 text-left">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className={`title-font text-base`} style={{ color: cat.color }}>{d.name}</span>
                                                    </div>
                                                    <p className="text-xs text-gray-300">{d.description}</p>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
