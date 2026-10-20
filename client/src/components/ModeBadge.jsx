import React from 'react';
import { GraduationCap, Globe, CheckCircle2 } from 'lucide-react';

export default function ModeBadge({ mode, confidence, sources = [] }) {
  const isItu = mode === 'itu';

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-1.5 text-[11px]">
      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold border ${
        isItu
          ? 'bg-blue-500/10 text-blue-300 border-blue-500/25'
          : 'bg-violet-500/10 text-violet-300 border-violet-500/25'
      }`}>
        {isItu ? <GraduationCap className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
        <span>{isItu ? 'ITU Grounded' : 'General AI'}</span>
        {confidence && (
          <span className="opacity-60">· {Math.round(confidence * 100)}%</span>
        )}
      </div>

      {isItu && sources.map((src, i) => (
        <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-800/80 text-slate-400 border border-slate-700/80">
          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 flex-shrink-0" />
          <span className="truncate max-w-[140px]">{src}</span>
        </span>
      ))}
    </div>
  );
}
