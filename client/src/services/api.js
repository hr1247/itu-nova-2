/**
 * API Service for ITU Nova Frontend
 */

const API_BASE_URL = 'http://localhost:5000'; // Points directly to Express backend

export async function sendChatMessage(message, history = [], mode = 'auto') {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message,
        history,
        mode
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server responded with status ${response.status}`);
    }

    const data = await response.json();

    // Map fields explicitly to align with App.jsx state structure
    return {
      reply: data.reply || "No response generated.",
      suggestions: data.suggestions || [],
      mode: data.mode || mode,
      confidence: data.confidence ?? 1.0,
      reason: data.reason || "",
      groundedSources: data.sources || []
    };
  } catch (error) {
    console.error('Chat API request error:', error);
    throw error;
  }
}

export async function checkServerHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`);
    if (!res.ok) return { online: false };
    const data = await res.json();
    return { online: true, ...data };
  } catch (err) {
    return { online: false, error: err.message };
  }
}

export async function fetchKnowledge() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/knowledge`);
    if (!res.ok) throw new Error('Failed to fetch knowledge');
    return await res.json();
  } catch (err) {
    console.warn('Using local fallback knowledge file:', err);
    // Dynamic import of local JSON
    const local = await import('../data/itu_knowledge.json');
    return local.default || local;
  }
}