import React, { useEffect, useRef } from 'react';
import MessageItem from './MessageItem';
import QuickSuggestions from './QuickSuggestions';
import { MessageSquare, GraduationCap, Globe } from 'lucide-react';

export default function MessageList({ messages, loading, onSelectPrompt, onSubmitFeedback }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <EmptyState onSelectPrompt={onSelectPrompt} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5 max-w-3xl mx-auto w-full">
      {messages.map((msg, i) => (
        <MessageItem 
          key={msg.id || i} 
          message={msg} 
          question={[...messages.slice(0, i)].reverse().find(item => item.role === 'user')?.content || ''}
          onSuggestionClick={onSelectPrompt} 
          onSubmitFeedback={onSubmitFeedback}
        />
      ))}

      {loading && <TypingIndicator />}

      <div ref={bottomRef} />
    </div>
  );
}

function EmptyState({ onSelectPrompt }) {
  return (
    <div className="w-full max-w-2xl mx-auto text-center space-y-8">
      <div>
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-xl shadow-blue-500/30 mb-4">
          <MessageSquare className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">How can I help you today?</h2>
        <p className="text-slate-400 text-sm max-w-md mx-auto leading-relaxed">
          I'm the ITU Chatbot — ask me anything about ITU Lahore's programs, admissions, fees, or general tech topics.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300">
          <GraduationCap className="w-3.5 h-3.5" />
          <span>BSCS & BSAI Courses, Fees, Merit</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300">
          <span>🚌</span>
          <span>ASTP Bus Routes, Lahore</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300">
          <Globe className="w-3.5 h-3.5" />
          <span>Coding, Math, Writing & More</span>
        </div>
      </div>

      <QuickSuggestions onSelectPrompt={onSelectPrompt} />
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-md shadow-blue-500/20">
        <MessageSquare className="w-4 h-4 text-white" />
      </div>
      <div className="px-4 py-3 bg-slate-800/80 border border-slate-700/60 rounded-2xl rounded-tl-sm inline-flex items-center gap-1.5">
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }}
            />
          ))}
        </div>
        <span className="text-slate-400 text-[12px] ml-1">ITU Chatbot is thinking...</span>
      </div>
    </div>
  );
}