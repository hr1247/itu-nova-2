import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import MessageList from './components/MessageList';
import ChatInput from './components/ChatInput';
import ConversationHistoryModal from './components/ConversationHistoryModal';
import KnowledgeExplorerModal from './components/KnowledgeExplorerModal';
import TransportModal from './components/TransportModal';
import { sendChatMessage, checkServerHealth } from './services/api';

const INITIAL_GREETING = {
  id: 'init-1',
  role: 'assistant',
  content: `### 👋 Welcome to ITU Chatbot!

I am your **ITU Chatbot** — the official AI assistant for **Information Technology University (ITU), Lahore**.

I can help you with two types of questions:
- 🏛️ **ITU Questions:** Programs, fees, merit formula, eligibility, bus routes & campus info
- 🌐 **General Questions:** Coding, math, writing, algorithms & more

*What would you like to know today?*`,
  suggestions: [
    'What is the merit formula for BSCS?',
    'How do I apply for scholarships?',
    'What are the shuttle bus routes?',
    'What programs are offered?'
  ],
  mode: 'itu',
  confidence: 1.0,
  groundedSources: ['ITU Official Knowledge Repository'],
  reason: 'Initial system welcome message.',
  timestamp: new Date().toISOString()
};

const CONVERSATIONS_STORAGE_KEY = 'itu_chatbot_conversations';
const LEGACY_MESSAGES_STORAGE_KEY = 'itu_chatbot_messages';

function loadConversations() {
  try {
    const savedConversations = localStorage.getItem(CONVERSATIONS_STORAGE_KEY);
    if (savedConversations) {
      const parsed = JSON.parse(savedConversations);
      return Array.isArray(parsed) ? parsed : [];
    }

    const legacyMessages = JSON.parse(localStorage.getItem(LEGACY_MESSAGES_STORAGE_KEY) || '[]');
    if (!Array.isArray(legacyMessages) || legacyMessages.length <= 1) return [];

    const firstUserMessage = legacyMessages.find(message => message.role === 'user');
    return [{
      id: `chat-${Date.now()}`,
      title: firstUserMessage?.content || 'Previous conversation',
      messages: legacyMessages,
      updatedAt: legacyMessages.at(-1)?.timestamp || new Date().toISOString()
    }];
  } catch {
    return [];
  }
}

export default function App() {
  const [conversations, setConversations] = useState(loadConversations);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([INITIAL_GREETING]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('auto'); // 'auto' | 'itu' | 'general'
  const [isKnowledgeModalOpen, setIsKnowledgeModalOpen] = useState(false);
  const [isTransportModalOpen, setIsTransportModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [serverStatus, setServerStatus] = useState({ online: true });

  useEffect(() => {
    try {
      localStorage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(conversations));
    } catch (e) {
      console.warn('Could not persist conversations to localStorage', e);
    }
  }, [conversations]);

  useEffect(() => {
    if (!activeConversationId || messages.length <= 1) return;

    const firstUserMessage = messages.find(message => message.role === 'user');
    const updatedAt = messages.at(-1)?.timestamp || new Date().toISOString();
    setConversations(previous => {
      const existing = previous.find(conversation => conversation.id === activeConversationId);
      const conversation = {
        id: activeConversationId,
        title: firstUserMessage?.content || 'Conversation',
        messages,
        updatedAt
      };
      return existing
        ? previous.map(item => item.id === activeConversationId ? conversation : item)
        : [conversation, ...previous];
    });
  }, [activeConversationId, messages]);

  useEffect(() => {
    const checkHealth = async () => {
      const status = await checkServerHealth();
      setServerStatus(status);
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSendMessage = async (text) => {
    if (!text || loading) return;

    const userMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    if (!activeConversationId) {
      setActiveConversationId(`chat-${Date.now()}`);
    }
    setLoading(true);

    try {
      // Prepare history payload (last 6 messages)
      const historyPayload = updatedMessages.slice(-6).map(m => ({
        role: m.role,
        content: m.content
      }));

      const response = await sendChatMessage(text, historyPayload, mode);

      const assistantMessage = {
        id: `ast-${Date.now()}`,
        role: 'assistant',
        content: response.reply,
        suggestions: response.suggestions || [], // 👈 Retains suggestions from backend
        mode: response.mode,
        confidence: response.confidence,
        groundedSources: response.groundedSources || [],
        reason: response.reason,
        timestamp: response.timestamp || new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error('Failed to get reply:', err);
      const errorMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **Unable to complete request:** ${err.message || 'Server connection error'}. Please verify that the backend server is running on port 5000.`,
        suggestions: ['Check server status', 'Retry query'],
        mode: mode === 'auto' ? 'general' : mode,
        confidence: 0,
        groundedSources: [],
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = () => {
    setActiveConversationId(null);
    setMessages([INITIAL_GREETING]);
    setIsHistoryModalOpen(false);
  };

  const handleOpenConversation = (conversation) => {
    setActiveConversationId(conversation.id);
    setMessages(conversation.messages);
    setIsHistoryModalOpen(false);
  };

  const handleDeleteConversation = (conversationId) => {
    setConversations(previous => previous.filter(conversation => conversation.id !== conversationId));
    if (activeConversationId === conversationId) {
      setActiveConversationId(null);
      setMessages([INITIAL_GREETING]);
    }
  };

  return (
    <div className="flex flex-col min-h-screen gradient-mesh">
      {/* Navigation Header */}
      <Header
        mode={mode}
        setMode={setMode}
        onOpenKnowledge={() => setIsKnowledgeModalOpen(true)}
        onOpenTransport={() => setIsTransportModalOpen(true)}
        onNewChat={handleNewChat}
        onOpenHistory={() => setIsHistoryModalOpen(true)}
        serverStatus={serverStatus}
        hasMessages={messages.length > 1}
        conversationCount={conversations.length}
      />

      {/* Main Chat Stream */}
      <main className="flex-1 flex flex-col justify-between max-w-7xl w-full mx-auto">
        <MessageList
          messages={messages}
          loading={loading}
          onSelectPrompt={handleSendMessage}
        />

        {/* Input Bar */}
        <ChatInput
          onSendMessage={handleSendMessage}
          loading={loading}
          mode={mode}
          setMode={setMode}
        />
      </main>

      {/* Interactive Modals */}
      <KnowledgeExplorerModal
        isOpen={isKnowledgeModalOpen}
        onClose={() => setIsKnowledgeModalOpen(false)}
      />

      <TransportModal
        isOpen={isTransportModalOpen}
        onClose={() => setIsTransportModalOpen(false)}
      />

      <ConversationHistoryModal
        isOpen={isHistoryModalOpen}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onClose={() => setIsHistoryModalOpen(false)}
        onOpenConversation={handleOpenConversation}
        onDeleteConversation={handleDeleteConversation}
      />
    </div>
  );
}