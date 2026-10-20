import React, { useState } from 'react';
import { Copy, Check, User, MessageSquare, Sparkles } from 'lucide-react';
import ModeBadge from './ModeBadge';

/* ─── Inline-formatting helper ───────────────────────────────────────── */
function InlineText({ text }) {
  if (!text) return null;
  const parts = [];
  let remaining = String(text);
  let key = 0;

  while (remaining.length > 0) {
    const codeMatch = remaining.match(/`([^`]+)`/);
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);

    let earliest = null;
    let type = null;
    if (codeMatch && (!earliest || codeMatch.index < earliest.index)) { earliest = codeMatch; type = 'code'; }
    if (boldMatch && (!earliest || boldMatch.index < earliest.index)) { earliest = boldMatch; type = 'bold'; }

    if (!earliest) { parts.push(remaining); break; }
    if (earliest.index > 0) parts.push(remaining.slice(0, earliest.index));

    if (type === 'code') {
      parts.push(
        <code key={key++} className="px-1.5 py-0.5 rounded-md bg-slate-800 text-sky-300 font-mono text-[12.5px] border border-slate-700/60">
          {earliest[1]}
        </code>
      );
    } else {
      parts.push(<strong key={key++} className="font-semibold text-white">{earliest[1]}</strong>);
    }
    remaining = remaining.slice(earliest.index + earliest[0].length);
  }
  return <>{parts}</>;
}

/* ─── Markdown Table ─────────────────────────────────────────────────── */
function MdTable({ rows }) {
  if (rows.length < 2) return null;
  const parse = (r) => r.split('|').slice(1, -1).map(c => c.trim());
  const header = parse(rows[0]);
  const isSep = rows[1].includes('---');
  const body = rows.slice(isSep ? 2 : 1);

  return (
    <div className="my-3 overflow-x-auto rounded-xl border border-slate-700/60 shadow-sm">
      <table className="w-full text-left text-[12.5px] border-collapse">
        <thead className="bg-slate-900 text-blue-300 font-semibold">
          <tr>
            {header.map((col, i) => (
              <th key={i} className="px-3 py-2 border-b border-slate-700/60 whitespace-nowrap">
                <InlineText text={col} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/80 text-slate-300">
          {body.map((rowStr, rIdx) => (
            <tr key={rIdx} className="hover:bg-slate-800/30 transition-colors">
              {parse(rowStr).map((cell, cIdx) => (
                <td key={cIdx} className="px-3 py-2"><InlineText text={cell} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Code Block ─────────────────────────────────────────────────────── */
function CodeBlock({ code, language }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-slate-700/60 bg-slate-900/80 shadow-md">
      <div className="flex items-center justify-between px-3.5 py-2 bg-slate-950/70 border-b border-slate-800 text-[11px]">
        <span className="font-mono text-blue-400 font-semibold uppercase tracking-wider">{language}</span>
        <button onClick={copy} className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-all">
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-[13px] font-mono text-slate-200 leading-relaxed"><code>{code}</code></pre>
    </div>
  );
}

/* ─── Markdown Renderer ──────────────────────────────────────────────── */
function Markdown({ content }) {
  const sections = (content || '').split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2 text-[14px] leading-relaxed text-slate-200">
      {sections.map((part, idx) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const lines = part.slice(3, -3).trim().split('\n');
          const first = lines[0].trim();
          const hasLang = first && !first.includes(' ') && first.length < 20;
          return <CodeBlock key={idx} language={hasLang ? first : 'code'} code={hasLang ? lines.slice(1).join('\n') : lines.join('\n')} />;
        }

        const elements = [];
        let tableBuffer = [];

        const flushTable = (k) => {
          if (tableBuffer.length > 0) {
            elements.push(<MdTable key={k} rows={tableBuffer} />);
            tableBuffer = [];
          }
        };

        part.split('\n').forEach((line, lIdx) => {
          const key = `${idx}-${lIdx}`;
          const t = line.trim();

          if (t.startsWith('|') && t.endsWith('|')) { tableBuffer.push(t); return; }
          flushTable(`tbl-${key}`);

          if (!t) { elements.push(<div key={key} className="h-1.5" />); return; }

          if (t.startsWith('### ')) { elements.push(<h4 key={key} className="text-[15px] font-bold text-white pt-2 pb-0.5 border-b border-slate-800/70"><InlineText text={t.slice(4)} /></h4>); return; }
          if (t.startsWith('## ')) { elements.push(<h3 key={key} className="text-base font-bold text-white pt-2"><InlineText text={t.slice(3)} /></h3>); return; }
          if (t.startsWith('# ')) { elements.push(<h2 key={key} className="text-lg font-bold text-white pt-2"><InlineText text={t.slice(2)} /></h2>); return; }

          if (t.startsWith('> ')) {
            elements.push(
              <div key={key} className="my-1.5 pl-3 py-1.5 bg-blue-950/30 rounded-r-lg text-slate-300 text-[13px] italic border-l-4 border-blue-500">
                <InlineText text={t.slice(2)} />
              </div>
            );
            return;
          }

          if (t.startsWith('* ') || t.startsWith('- ')) {
            elements.push(
              <div key={key} className="flex items-start gap-2 py-0.5 text-slate-300">
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                <div className="text-[13.5px]"><InlineText text={t.slice(2)} /></div>
              </div>
            );
            return;
          }

          const numMatch = t.match(/^(\d+)\.\s+(.*)/);
          if (numMatch) {
            elements.push(
              <div key={key} className="flex items-start gap-2.5 py-0.5 text-slate-300">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600/20 border border-blue-500/30 text-blue-300 text-[11px] font-bold flex items-center justify-center mt-0.5">
                  {numMatch[1]}
                </span>
                <div className="text-[13.5px]"><InlineText text={numMatch[2]} /></div>
              </div>
            );
            return;
          }

          elements.push(<p key={key} className="text-slate-200 text-[13.5px]"><InlineText text={t} /></p>);
        });

        flushTable(`tbl-final-${idx}`);
        return <React.Fragment key={idx}>{elements}</React.Fragment>;
      })}
    </div>
  );
}

/* ─── Message Item ───────────────────────────────────────────────────── */
export default function MessageItem({ message, onSuggestionClick }) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  // Normalizes text content from various potential keys
  const messageText = message.content || message.reply || message.text || '';
  const suggestions = message.suggestions || [];

  const copy = () => { navigator.clipboard.writeText(messageText); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const timeStr = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className={`flex gap-3 group ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className="flex-shrink-0 mt-0.5">
        {isUser ? (
          <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center">
            <User className="w-4 h-4 text-slate-300" />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-md shadow-blue-500/20">
            <MessageSquare className="w-4 h-4 text-white" />
          </div>
        )}
      </div>

      {/* Bubble + Suggestions Container */}
      <div className={`flex flex-col max-w-[82%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Header row */}
        <div className={`flex items-center gap-2 mb-1 text-[11px] text-slate-500 ${isUser ? 'flex-row-reverse' : ''}`}>
          <span className="font-medium text-slate-400">{isUser ? 'You' : 'ITU Chatbot'}</span>
          <span>{timeStr}</span>
          <button
            onClick={copy}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-800 transition-all"
            title="Copy"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>

        {/* Mode badge (only for AI messages) */}
        {!isUser && (
          <ModeBadge mode={message.mode} confidence={message.confidence} sources={message.groundedSources || message.sources} />
        )}

        {/* Message content */}
        <div className={`px-4 py-3 rounded-2xl shadow-sm ${
          isUser
            ? 'bg-blue-600 text-white rounded-tr-sm'
            : 'bg-slate-800/80 border border-slate-700/60 rounded-tl-sm'
        }`}>
          {isUser ? (
            <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{messageText}</p>
          ) : (
            <Markdown content={messageText} />
          )}
        </div>

        {/* ─── SUGGESTIONS BUTTON CHIPS ─── */}
        {!isUser && suggestions.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {suggestions.map((suggestionText, idx) => (
              <button
                key={idx}
                onClick={() => onSuggestionClick && onSuggestionClick(suggestionText)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium bg-blue-950/40 border border-blue-500/30 text-blue-300 hover:bg-blue-600 hover:text-white hover:border-blue-500 transition-all active:scale-95 shadow-sm"
              >
                <Sparkles className="w-3 h-3 text-blue-400" />
                <span>{suggestionText}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}