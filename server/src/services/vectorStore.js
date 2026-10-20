import fs from 'fs';
import path from 'path';
import cosineSimilarity from 'compute-cosine-similarity';

let vectorStore = [];

// Helper to get vector embedding from local Ollama
export async function getEmbedding(text) {
  const response = await fetch('http://localhost:11434/api/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'nomic-embed-text',
      prompt: text
    })
  });
  const data = await response.json();
  return data.embedding;
}

// Ingest knowledge documents and store their embeddings
export async function initializeVectorStore() {
  const knowledgeDir = path.join(process.cwd(), 'src', 'knowledge');
  if (!fs.existsSync(knowledgeDir)) {
    fs.mkdirSync(knowledgeDir, { recursive: true });
  }

  const files = fs.readdirSync(knowledgeDir);
  vectorStore = [];

  for (const file of files) {
    const filePath = path.join(knowledgeDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Chunk content by paragraphs or sections
    const chunks = content.split('\n\n').filter(chunk => chunk.trim().length > 0);

    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk);
      vectorStore.push({
        text: chunk,
        embedding: embedding,
        source: file
      });
    }
  }
  console.log(`Vector Store Initialized: ${vectorStore.length} knowledge chunks indexed.`);
}

// Find top matching context by semantic similarity
export async function searchKnowledge(query, threshold = 0.55) {
  if (vectorStore.length === 0) return { context: '', score: 0 };

  const queryEmbedding = await getEmbedding(query);
  let bestMatch = null;
  let maxScore = -1;

  for (const item of vectorStore) {
    const score = cosineSimilarity(queryEmbedding, item.embedding);
    if (score > maxScore) {
      maxScore = score;
      bestMatch = item;
    }
  }

  if (maxScore >= threshold) {
    return { context: bestMatch.text, score: maxScore };
  }

  return { context: '', score: maxScore };
}