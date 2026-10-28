import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import chatRoutes from './routes/chat.js';
import { initializeVectorStore } from './services/routerService.js';
import { initializeLearningStorage } from './services/learningService.js';
import { processAllPendingCandidates } from './services/autonomousLearningEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*', // Allow frontend development server
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    service: 'ITU Nova Backend API',
    status: 'ok',
    endpoints: {
      health: '/api/health',
      aiHealth: '/api/health/ai',
      chat: 'POST /api/chat',
      knowledge: 'GET /api/knowledge'
    },
    frontend: 'http://localhost:3000'
  });
});

// API Routes
app.use('/api', chatRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ITU Nova Backend API',
    timestamp: new Date().toISOString(),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    openaiModel: process.env.OPENAI_MODEL || 'gpt-6.1-sol'
  });
});

const server = app.listen(PORT, async () => {
  console.log(`🚀 ITU Nova Server running on http://localhost:${PORT}`);
  console.log(`📡 Chat API endpoint available at http://localhost:${PORT}/api/chat`);
  console.log(`🩺 AI Health Diagnostic available at http://localhost:${PORT}/api/health/ai`);

  initializeLearningStorage();
  // Initialize Vector Database Embeddings on startup
  await initializeVectorStore();
  // Process any pending learning candidates autonomously
  processAllPendingCandidates().catch(err => {
    console.warn('[Server Startup] Initial candidate processing notice:', err.message);
  });
});

server.on('error', async (error) => {
  if (error.code === 'EADDRINUSE') {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      const health = response.ok ? await response.json() : null;

      if (health?.service === 'ITU Nova Backend API') {
        console.log(`ITU Nova backend is already running at http://localhost:${PORT}. Using the existing instance.`);
        process.exit(0);
      }
    } catch {
      // The port is occupied, but it is not serving this backend's health route.
    }

    console.error(`Port ${PORT} is already in use by another application. Stop it or set a different PORT in server/.env.`);
    process.exit(1);
  }

  console.error('Failed to start ITU Nova backend:', error);
  process.exit(1);
});