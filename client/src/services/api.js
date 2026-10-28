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

export async function submitFeedback(feedback) {
  const response = await fetch(`${API_BASE_URL}/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(feedback)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Feedback request failed with status ${response.status}`);
  }
  return data;
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
  const res = await fetch(`${API_BASE_URL}/api/knowledge`);
  if (!res.ok) throw new Error(`Failed to fetch knowledge (status ${res.status})`);
  return res.json();
}