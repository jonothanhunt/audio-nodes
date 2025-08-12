'use client';

import React from 'react';
import { Search } from 'lucide-react';
import { groupDefinitionsByCategory, getCategoryTone, getNodeMeta } from '@/lib/nodeRegistry';

interface NodeLibraryProps { onAddNode: (type: string) => void; }

export default function NodeLibrary({ onAddNode }: NodeLibraryProps) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState('All');

  const grouped = React.useMemo(() => groupDefinitionsByCategory(), []);
  const categories = ['All', 'Synthesis', 'Effects', 'Sequencing', 'Utility'];

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
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-2 py-1 text-xs rounded ${selectedCategory === category ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >{category}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto space-y-3">
        {Object.entries(grouped).map(([cat, defs]) => {
          if (selectedCategory !== 'All' && selectedCategory !== cat) return null;
          const visible = defs.filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()));
          if (!visible.length) return null;
          return (
            <div key={cat}>
              <h3 className="text-xs font-medium text-gray-400 mb-2 tracking-wide uppercase">{cat}</h3>
              <div className="space-y-2">
                {visible.map(d => {
                  const tone = getCategoryTone(getNodeMeta(d.type).category);
                  const styles: Record<string, { border: string; hoverBorder: string; title: string; icon: string; gradientFrom: string }> = {
                    purple: { border: 'border-purple-500/30', hoverBorder: 'hover:border-purple-500', title: 'text-purple-400', icon: 'text-purple-400', gradientFrom: 'from-purple-500/10' },
                    blue: { border: 'border-blue-500/30', hoverBorder: 'hover:border-blue-500', title: 'text-blue-400', icon: 'text-blue-400', gradientFrom: 'from-blue-500/10' },
                    green: { border: 'border-green-500/30', hoverBorder: 'hover:border-green-500', title: 'text-green-400', icon: 'text-green-400', gradientFrom: 'from-green-500/10' },
                    amber: { border: 'border-amber-500/30', hoverBorder: 'hover:border-amber-500', title: 'text-amber-400', icon: 'text-amber-400', gradientFrom: 'from-amber-500/10' },
                    slate: { border: 'border-slate-500/30', hoverBorder: 'hover:border-slate-500', title: 'text-slate-400', icon: 'text-slate-400', gradientFrom: 'from-slate-500/10' },
                  };
                  const s = styles[tone];
                  const Icon = d.icon;
                  return (
                    <button key={d.type} onClick={() => onAddNode(d.type)} className={`relative w-full p-3 rounded-lg border ${s.border} ${s.hoverBorder} bg-gray-900 shadow-lg transition-colors`}>
                      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${s.gradientFrom} via-transparent to-transparent rounded-lg`} />
                      <div className="relative flex items-start gap-3">
                        <Icon className={`w-4 h-4 ${s.icon} flex-shrink-0 mt-0.5`} />
                        <div className="flex-1 text-left">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`title-font ${s.title} text-base`}>{d.name}</span>
                            {/* <span className="text-xs text-gray-300 bg-black/20 px-1.5 py-0.5 rounded">{d.tag}</span> */}
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
