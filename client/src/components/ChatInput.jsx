import React, { useState, useRef, useEffect } from 'react';
import { Send, Cpu, GraduationCap, Globe, Paperclip } from 'lucide-react';

export default function ChatInput({ onSendMessage, loading, mode, setMode }) {
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [input]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSend = !!input.trim() && !loading;

  const modeConfig = {
    auto:    { label: 'Auto Detect', icon: Cpu,           color: 'text-blue-400',   next: 'itu'     },
    itu:     { label: 'ITU Mode',    icon: GraduationCap, color: 'text-blue-400',   next: 'general' },
    general: { label: 'General AI',  icon: Globe,          color: 'text-violet-400', next: 'auto'    }
  };
  const current = modeConfig[mode];
  const ModeIcon = current.icon;

  return (
    <div className="px-4 pb-5 pt-2 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent">
      <div className="max-w-3xl mx-auto">
        <div className="relative bg-slate-800/90 border border-slate-700/70 rounded-2xl shadow-xl focus-within:border-blue-500/60 focus-within:shadow-blue-500/10 focus-within:shadow-lg transition-all">

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            placeholder={
              mode === 'itu'
                ? 'Ask about ITU programs, fees, merit, bus routes...'
                : mode === 'general'
                ? 'Ask any coding, math or general knowledge question...'
                : 'Ask anything — ITU info or general knowledge...'
            }
            className="w-full bg-transparent text-slate-100 placeholder-slate-500 text-[14px] resize-none outline-none px-4 pt-3.5 pb-10 min-h-[52px] max-h-[140px]"
          />

          {/* Bottom toolbar */}
          <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
            {/* Mode toggle */}
            <button
              type="button"
              onClick={() => setMode(current.next)}
              title="Click to change routing mode"
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-900/80 border border-slate-700 hover:border-slate-600 transition-all ${current.color}`}
            >
              <ModeIcon className="w-3 h-3" />
              <span>{current.label}</span>
            </button>

            {/* Right side: hint + send */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-600 hidden sm:block">Enter ↵ to send</span>
              <button
                onClick={handleSubmit}
                disabled={!canSend}
                className={`flex items-center justify-center w-8 h-8 rounded-xl transition-all ${
                  canSend
                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/30 active:scale-95'
                    : 'bg-slate-700/60 text-slate-500 cursor-not-allowed'
                }`}
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-[10.5px] text-slate-600 mt-2">
          ITU Chatbot may make mistakes. Verify important information with the admissions office.
        </p>
      </div>
    </div>
  );
}
