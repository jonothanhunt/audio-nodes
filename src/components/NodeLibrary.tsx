'use client';

import React from 'react';
import { Volume2, Waves, Speaker, Search, Music } from 'lucide-react';

interface NodeLibraryProps {
  onAddNode: (type: string) => void;
}

type IconType = (props: { className?: string }) => React.ReactElement;

const nodeCategories: {
  name: string;
  nodes: Array<{
    type: string;
    name: string;
    description: string;
    icon: IconType;
    color: 'purple' | 'blue' | 'green' | 'amber';
    tag: string;
  }>;
}[] = [
  {
    name: 'Synthesis',
    nodes: [
      {
        type: 'oscillator',
        name: 'Oscillator',
        description: 'Basic waveform generator',
        icon: Volume2 as unknown as IconType,
        color: 'purple',
        tag: 'synthesis'
      },
      {
        type: 'synth',
        name: 'Synth',
        description: 'Poly synth (MIDI in → audio out)',
        icon: Volume2 as unknown as IconType,
        color: 'purple',
        tag: 'synthesis'
      }
    ]
  },
  {
    name: 'Effects',
    nodes: [
      {
        type: 'reverb',
        name: 'Reverb',
        description: 'Spatial reverberation',
        icon: Waves as unknown as IconType,
        color: 'blue',
        tag: 'effect'
      }
    ]
  },
  {
    name: 'Sequencing',
    nodes: [
      {
        type: 'sequencer',
        name: 'Sequencer',
        description: 'Step sequencer (MIDI out)',
        icon: Music as unknown as IconType,
        color: 'amber',
        tag: 'midi'
      }
    ]
  },
  {
    name: 'Utility',
    nodes: [
      {
        type: 'speaker',
        name: 'Speaker',
        description: 'Audio output',
        icon: Speaker as unknown as IconType,
        color: 'green',
        tag: 'utility'
      }
    ]
  }
];

export default function NodeLibrary({ onAddNode }: NodeLibraryProps) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState('All');

  const categories = ['All', 'Synthesis', 'Effects', 'Sequencing', 'Utility'];

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header: search + filters */}
      <div className="mb-3">
        {/* Search */}
        <div className="relative mb-3">
          <Music className="hidden" />
          <Speaker className="hidden" />
          <Waves className="hidden" />
          <Volume2 className="hidden" />
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search nodes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap gap-1">
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-2 py-1 text-xs rounded ${
                selectedCategory === category
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Node Categories */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {nodeCategories.map(category => {
          const categoryNodes = category.nodes.filter(node => 
            node.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
            (selectedCategory === 'All' || category.name === selectedCategory)
          );

          if (categoryNodes.length === 0) return null;

          return (
            <div key={category.name}>
              <h3 className="text-sm font-medium text-gray-400 mb-2">
                {category.name}
              </h3>
              <div className="space-y-2">
                {categoryNodes.map(node => {
                  const Icon = node.icon;
                  const styles: Record<string, { border: string; hoverBorder: string; title: string; icon: string; gradientFrom: string }>= {
                    purple: {
                      border: 'border-purple-500/30',
                      hoverBorder: 'hover:border-purple-500',
                      title: 'text-purple-400',
                      icon: 'text-purple-400',
                      gradientFrom: 'from-purple-500/10',
                    },
                    blue: {
                      border: 'border-blue-500/30',
                      hoverBorder: 'hover:border-blue-500',
                      title: 'text-blue-400',
                      icon: 'text-blue-400',
                      gradientFrom: 'from-blue-500/10',
                    },
                    green: {
                      border: 'border-green-500/30',
                      hoverBorder: 'hover:border-green-500',
                      title: 'text-green-400',
                      icon: 'text-green-400',
                      gradientFrom: 'from-green-500/10',
                    },
                    amber: {
                      border: 'border-amber-500/30',
                      hoverBorder: 'hover:border-amber-500',
                      title: 'text-amber-400',
                      icon: 'text-amber-400',
                      gradientFrom: 'from-amber-500/10',
                    },
                  };
                  const s = styles[node.color] ?? styles.purple;

                  return (
                    <button
                      key={node.type}
                      onClick={() => onAddNode(node.type)}
                      className={`relative w-full p-3 rounded-lg border ${s.border} ${s.hoverBorder} bg-gray-900 shadow-lg transition-colors`}
                    >
                      {/* subtle gradient overlay to match nodes */}
                      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${s.gradientFrom} via-transparent to-transparent rounded-lg`} />

                      <div className="relative flex items-start gap-3">
                        <Icon className={`w-4 h-4 ${s.icon} flex-shrink-0 mt-0.5`} />
                        <div className="flex-1 text-left">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`title-font font-w-70 ${s.title} text-sm`}>
                              {node.name}
                            </span>
                            <span className="text-xs text-gray-300 bg-black/20 px-1.5 py-0.5 rounded">
                              {node.tag}
                            </span>
                          </div>
                          <p className="text-xs text-gray-300">
                            {node.description}
                          </p>
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
