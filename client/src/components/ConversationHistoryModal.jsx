import React from 'react';
import { Clock3, MessageSquare, Trash2, X } from 'lucide-react';

function formatUpdatedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Saved chat';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ConversationHistoryModal({
  isOpen,
  conversations,
  activeConversationId,
  onClose,
  onOpenConversation,
  onDeleteConversation
}) {
  if (!isOpen) return null;

  const sortedConversations = [...conversations].sort(
    (first, second) => new Date(second.updatedAt) - new Date(first.updatedAt)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversation-history-title"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 id="conversation-history-title" className="text-base font-semibold text-white">Previous chats</h2>
            <p className="mt-1 text-xs text-slate-400">Your conversations are saved in this browser.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat history"
            className="rounded-md p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-3">
          {sortedConversations.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <MessageSquare className="mb-3 h-7 w-7 text-slate-500" />
              <p className="text-sm font-medium text-slate-200">No previous chats</p>
              <p className="mt-1 text-xs text-slate-500">Your conversations will appear here after you chat.</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {sortedConversations.map(conversation => (
                <li key={conversation.id}>
                  <div className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 transition ${
                    conversation.id === activeConversationId
                      ? 'border-blue-500/40 bg-blue-500/10'
                      : 'border-transparent hover:border-slate-700 hover:bg-slate-800/70'
                  }`}>
                    <button
                      type="button"
                      onClick={() => onOpenConversation(conversation)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-sm font-medium text-slate-100">
                        {conversation.title || 'Conversation'}
                      </span>
                      <span className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                        <Clock3 className="h-3 w-3" />
                        {formatUpdatedAt(conversation.updatedAt)}
                        <span className="px-0.5">·</span>
                        {conversation.messages?.filter(message => message.role === 'user').length || 0} messages
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteConversation(conversation.id)}
                      aria-label={`Delete ${conversation.title || 'conversation'}`}
                      className="rounded-md p-2 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}