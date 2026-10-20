import React from 'react';
import { DollarSign, Calculator, Bus, Award, Code2, Brain, BookOpen } from 'lucide-react';

const SUGGESTIONS = [
  {
    icon: DollarSign,
    label: 'Tuition & Fee Structure',
    prompt: 'What is the fee per credit hour for BSCS and BSAI at ITU, and what is the estimated first semester cost?',
    tag: 'ITU',
    color: 'blue'
  },
  {
    icon: Calculator,
    label: 'Merit Formula',
    prompt: 'Explain the ITU undergraduate aggregate merit formula with a step-by-step example.',
    tag: 'ITU',
    color: 'blue'
  },
  {
    icon: Bus,
    label: 'Bus Routes & Stops',
    prompt: 'What are the ITU transport bus routes, stops, and morning departure timings in Lahore?',
    tag: 'ITU',
    color: 'blue'
  },
  {
    icon: Award,
    label: 'Eligibility Criteria',
    prompt: 'Can Pre-Medical (F.Sc) and ICS students apply for BSCS or BSAI at ITU?',
    tag: 'ITU',
    color: 'blue'
  },
  {
    icon: Code2,
    label: 'Coding Help',
    prompt: 'Write a binary search algorithm in Python with time complexity analysis.',
    tag: 'General',
    color: 'violet'
  },
  {
    icon: Brain,
    label: 'Explain AI Concept',
    prompt: 'Explain how neural networks learn using gradient descent with a simple analogy.',
    tag: 'General',
    color: 'violet'
  }
];

export default function QuickSuggestions({ onSelectPrompt }) {
  return (
    <div>
      <p className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold mb-3 text-center">
        Common Questions · Click to ask
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SUGGESTIONS.map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={idx}
              onClick={() => onSelectPrompt(item.prompt)}
              className="flex items-center gap-3 p-3 text-left rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-slate-600 transition-all group"
            >
              <div className={`p-2 rounded-lg flex-shrink-0 ${
                item.color === 'blue'
                  ? 'bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/15'
                  : 'bg-violet-500/10 text-violet-400 group-hover:bg-violet-500/15'
              }`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[13px] font-semibold text-slate-200 group-hover:text-white truncate">
                    {item.label}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase flex-shrink-0 ${
                    item.color === 'blue'
                      ? 'bg-blue-900/60 text-blue-300 border border-blue-700/50'
                      : 'bg-violet-900/60 text-violet-300 border border-violet-700/50'
                  }`}>
                    {item.tag}
                  </span>
                </div>
                <p className="text-[11.5px] text-slate-500 group-hover:text-slate-400 line-clamp-1 truncate">
                  {item.prompt}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
