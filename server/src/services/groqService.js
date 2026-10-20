export async function generateGeneralResponse({ userMessage, chatHistory = [], groundedContext = '' }) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || !apiKey.trim()) {
    return {
      text: 'General AI is not configured. Add GROQ_API_KEY to your server environment to enable Groq responses.',
      suggestions: ['Set GROQ_API_KEY', 'Retry query', 'Switch to ITU mode']
    };
  }

  const modelCandidates = [
    process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
    'qwen/qwen3-8b-27b',
    'openai/gpt-oss-120b'
  ];

  let lastError = null;

  for (const model of modelCandidates) {
    try {
      const messages = [
        {
          role: 'system',
          content: 'You are a helpful assistant. Answer clearly, briefly, and directly. If the user asks about ITU, answer from the ITU knowledge context when available. If no context is provided, answer in a useful general way.'
        },
        ...chatHistory.map(item => ({
          role: item.role === 'user' ? 'user' : 'assistant',
          content: String(item.content || '')
        })),
        {
          role: 'user',
          content: groundedContext ? `Context:\n${groundedContext}\n\nQuestion:\n${userMessage}` : userMessage
        }
      ];

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 500
        })
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => '');
        const message = `Groq API returned ${res.status}: ${errorBody || 'unknown error'}`;
        lastError = new Error(message);

        if (res.status === 404 || res.status === 400) {
          console.warn(`Groq model unavailable: ${model}. Trying fallback model.`);
          continue;
        }

        throw lastError;
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content || 'I could not generate a response right now.';

      const suggestions = [
        'Tell me more',
        'Give me an example',
        'Explain in simpler terms'
      ];

      return {
        text: content.trim(),
        suggestions
      };
    } catch (error) {
      lastError = error;
      console.error(`Groq generation error with model ${model}:`, error.message);
    }
  }

  console.error('Groq generation failed across all candidate models:', lastError?.message || 'unknown error');

  return {
    text: 'The general AI provider is not available right now. Please try again or switch to ITU mode.',
    suggestions: ['Retry query', 'Switch to ITU mode', 'Check API key']
  };
}
