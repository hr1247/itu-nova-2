import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import MessageList from './components/MessageList';
import ChatInput from './components/ChatInput';
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

export default function App() {
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('itu_chatbot_messages');
      return saved ? JSON.parse(saved) : [INITIAL_GREETING];
    } catch {
      return [INITIAL_GREETING];
    }
  });

  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('auto'); // 'auto' | 'itu' | 'general'
  const [isKnowledgeModalOpen, setIsKnowledgeModalOpen] = useState(false);
  const [isTransportModalOpen, setIsTransportModalOpen] = useState(false);
  const [serverStatus, setServerStatus] = useState({ online: true });

  // Save conversation to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('itu_chatbot_messages', JSON.stringify(messages));
    } catch (e) {
      console.warn('Could not persist messages to localStorage', e);
    }
  }, [messages]);

  // Check backend server health
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

  const handleClearChat = () => {
    if (window.confirm('Are you sure you want to clear your current conversation?')) {
      setMessages([INITIAL_GREETING]);
      localStorage.removeItem('itu_chatbot_messages');
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
        onClearChat={handleClearChat}
        serverStatus={serverStatus}
        hasMessages={messages.length > 1}
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
    </div>
  );
}