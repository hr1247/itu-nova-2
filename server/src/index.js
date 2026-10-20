import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import chatRoutes from './routes/chat.js';
import { initializeVectorStore } from './services/routerService.js';

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

// API Routes
app.use('/api', chatRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ITU Nova Backend API',
    timestamp: new Date().toISOString(),
    geminiConfigured: !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE')
  });
});

app.listen(PORT, async () => {
  console.log(`🚀 ITU Nova Server running on http://localhost:${PORT}`);
  console.log(`📡 Chat API endpoint available at http://localhost:${PORT}/api/chat`);

  // Initialize Vector Database Embeddings on startup
  await initializeVectorStore();
});