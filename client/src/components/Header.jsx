import React from 'react';
import { GraduationCap, Bus, BookOpen, Trash2, Cpu, Globe, MessageSquare } from 'lucide-react';

export default function Header({ mode, setMode, onOpenKnowledge, onOpenTransport, onClearChat, serverStatus, hasMessages }) {
  return (
    <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-xl border-b border-slate-800 px-4 sm:px-6 py-3">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">

        {/* Brand */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${serverStatus?.online ? 'bg-emerald-500' : 'bg-amber-400'}`}
              title={serverStatus?.online ? 'Server online' : 'Connecting...'}
            />
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-white leading-none">ITU Chatbot</h1>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-none hidden sm:block">Information Technology University, Lahore</p>
          </div>
        </div>

        {/* Center: Mode Switcher */}
        <div className="flex items-center bg-slate-800/80 border border-slate-700/60 rounded-xl p-1 gap-0.5 text-[11px]">
          <button
            onClick={() => setMode('auto')}
            title="Auto-detect mode (recommended)"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold transition-all whitespace-nowrap ${
              mode === 'auto' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            <Cpu className="w-3 h-3" />
            <span className="hidden sm:inline">Auto</span>
          </button>
          <button
            onClick={() => setMode('itu')}
            title="ITU mode: grounded in university data"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold transition-all whitespace-nowrap ${
              mode === 'itu' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            <GraduationCap className="w-3 h-3" />
            <span className="hidden sm:inline">ITU</span>
          </button>
          <button
            onClick={() => setMode('general')}
            title="General AI: open-ended questions"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold transition-all whitespace-nowrap ${
              mode === 'general' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            <Globe className="w-3 h-3" />
            <span className="hidden sm:inline">General</span>
          </button>
        </div>

        {/* Right: Quick Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onOpenKnowledge}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all"
            title="View ITU programs, fees & merit"
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden md:inline">Programs</span>
          </button>

          <button
            onClick={onOpenTransport}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all"
            title="View bus routes & timings"
          >
            <Bus className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">Bus Routes</span>
          </button>

          {hasMessages && (
            <button
              onClick={onClearChat}
              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all"
              title="Clear chat"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

      </div>
    </header>
  );
}
