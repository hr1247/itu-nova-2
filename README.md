# 🏛️ ITU Nova — Dual-Purpose AI Assistant for ITU Lahore

**ITU Nova** is a full-stack, dual-purpose AI Assistant engineered specifically for **Information Technology University (ITU), Lahore** (located at Arfa Software Technology Park, ASTP). 

It features an intelligent prompt routing engine that seamlessly distinguishes between **ITU-specific academic/campus inquiries** and **general-domain tasks** (such as coding, STEM calculations, creative writing, and world knowledge).

---

## ✨ Key Features & Architecture

### 1. Dual-Mode Processing Architecture
* **🏛️ Mode A: ITU Grounded Intelligence**
  * When a user asks about ITU admissions, fees, credit hours, curriculums, merit calculations, eligibility, or transport routes, the backend router automatically classifies the intent and extracts verified facts from the dedicated ITU knowledge base (`src/data/itu_knowledge.json`).
  * Responses are grounded in official university figures with clear source citations and confidence scores.
* **🌐 Mode B: General Open Intelligence**
  * When a user asks general coding questions (e.g. Python, C++, React), algorithm design, calculus problems, essay writing, or general knowledge, the router frees the assistant from university constraints and operates as an agile, unrestricted intelligent LLM companion.

### 2. Rich Structured Knowledge Base (`src/data/itu_knowledge.json`)
* **Undergraduate Programs:**
  * **BS Computer Science (BSCS):** 134 Credit Hours, 8 semesters, complete course outlines, NCEAC highest 'W' category.
  * **BS Artificial Intelligence (BSAI):** 133 Credit Hours, 8 semesters, specialized neural architectures, computer vision, robotics, GPU cluster access.
* **Credit Hour Fee Structures:**
  * BSCS: **PKR 9,200** per credit hour (~PKR 156,400 typical semester tuition).
  * BSAI: **PKR 9,500** per credit hour (~PKR 161,500 typical semester tuition).
  * Admission Fee (PKR 25,000 once), Refundable Security Deposit (PKR 15,000).
  * Transport: **PKR 28,000** per semester across 4 Lahore routes.
* **Admissions & Merit Formulas:**
  * Mathematical weighting: $\text{Aggregate} = (\text{Matric } \% \times 0.15) + (\text{Inter } \% \times 0.35) + (\text{Test } \% \times 0.50)$.
  * Step-by-step example and previous closing merit benchmarks.
* **Transport & Bus Network:**
  * **Route 1:** Canal & Southern Lahore (Thokar Niaz Baig ➔ Campus Bridge ➔ Jinnah Hospital ➔ Muslim Town ➔ ASTP).
  * **Route 2:** Northern Lahore & City Center (Shahdara ➔ Ravi Rd ➔ Bhati Gate ➔ GCU / Mall Rd ➔ Mozang ➔ ASTP).
  * **Route 3:** DHA, Cantt & Ring Road Express (DHA Phase 5 ➔ Lalik Jan ➔ Ghazi Rd ➔ Walton ➔ ASTP).
  * **Route 4:** Wapda Town, Johar Town & Township (Wapda Town ➔ Shaukat Khanum ➔ Expo Center ➔ Peco Rd ➔ ASTP).
  * Direct connectivity via the **Lahore Metro Bus** station located right outside Arfa Software Technology Park.
* **Campus & Research Labs:**
  * ASTP Floors 3, 4, 6, 8, 9; AI Lab, CSaLT (Speech & Language Tech), Computer Vision Lab, NCCS Cyber Security, and Plan9 Tech Incubator.

### 3. Interactive Web UI
* **Real-time Routing Badge:** Displays whether each response was answered via *ITU Grounded* mode (with source pills and confidence) or *General AI* mode.
* **Manual Mode Override:** Easily toggle between **Auto-Detect**, **ITU Only**, or **General AI** mode.
* **ITU Knowledge Explorer Modal:** Full visual browser with an interactive **Live Merit Calculator**, degree course tables, fee schedules, and campus lab overview.
* **Bus Routes Viewer:** Detailed timeline stops, departure times, and transit fees.
* **Markdown & Code Rendering:** Beautiful tables, lists, blockquotes, and dark syntax-highlighted code blocks with one-click copy.

---

## 📂 Repository Structure

```text
itu chatbot/
├── package.json                 # Monorepo root scripts (dev, dev:server, dev:client, build)
├── README.md                    # Documentation & user guide
├── .env.example                 # Root environment variables sample
├── src/
│   └── data/
│       └── itu_knowledge.json   # Primary ITU Lahore Grounded Knowledge Base
│
├── server/                      # Node.js + Express Backend
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── index.js             # Express app setup and middleware
│       ├── routes/
│       │   └── chat.js          # /api/chat and /api/knowledge routes
│       ├── controllers/
│       │   └── chatController.js# Request validation and pipeline orchestration
│       ├── services/
│       │   ├── routerService.js # Dual-mode classification engine (ITU vs General)
│       │   ├── knowledgeService.js # Dynamic section retrieval and indexing
│       │   └── llmService.js    # Gemini LLM generation + zero-failure fallback
│       └── utils/
│           └── promptTemplates.js # Persona prompts for ITU Nova
│
└── client/                      # React + Vite + Tailwind CSS Frontend
    ├── package.json
    ├── vite.config.js           # Vite dev server with proxy to backend
    ├── tailwind.config.js       # ITU brand color palette & styling
    ├── postcss.config.js
    ├── index.html               # Web entry with Google Fonts
    └── src/
        ├── main.jsx
        ├── App.jsx              # Main chat controller & modal manager
        ├── index.css            # Custom glassmorphism and animations
        ├── data/
        │   └── itu_knowledge.json
        ├── services/
        │   └── api.js           # Fetch client for Express backend
        └── components/
            ├── Header.jsx       # Brand header, mode switcher, quick action buttons
            ├── ChatInput.jsx    # Auto-resizing input with mode pills & send trigger
            ├── MessageList.jsx  # Conversation stream & hero empty state
            ├── MessageItem.jsx  # Markdown parser, code blocks, tables & copy button
            ├── ModeBadge.jsx    # Dual-mode status & source badge
            ├── QuickSuggestions.jsx # One-click prompt suggestion cards
            ├── KnowledgeExplorerModal.jsx # Curriculums, fees & live merit calculator
            └── TransportModal.jsx # Visual timeline for all 4 Lahore bus routes
```

---

## 🚀 Getting Started

### Prerequisites
* **Node.js**: v18.0.0 or later (v20+ recommended)
* **npm**: v9.0.0 or later

### Installation

From the root directory, install all dependencies across the root, server, and client:

```bash
npm run install:all
```

Alternatively, you can install them individually:
```bash
# Root dependencies
npm install

# Backend dependencies
cd server && npm install && cd ..

# Frontend dependencies
cd client && npm install && cd ..
```

---

## 🏃 Running the Application

### Option A: Run Both Concurrently (Recommended)
From the root directory:
```bash
npm run dev
```
* **Frontend:** [http://localhost:3000](http://localhost:3000)
* **Backend API:** [http://localhost:5000](http://localhost:5000)

### Option B: Run Server and Client in Separate Terminals

1. **Start the Express Backend:**
   ```bash
   npm run dev:server
   # or: cd server && npm run dev
   ```

2. **Start the React + Vite Frontend:**
   ```bash
   npm run dev:client
   # or: cd client && npm run dev
   ```

---

## 🔑 Environment Configuration (Optional)

ITU Nova works **100% out of the box** using its built-in knowledge retrieval and algorithmic reasoning engine. 

To enable live Google Gemini generative completions:
1. Open `server/.env` (or copy from `server/.env.example`).
2. Add your Google Gemini API Key:
   ```env
   PORT=5000
   GEMINI_API_KEY=AIzaSy...YourKeyHere
   ```
3. Restart the server. The backend will automatically activate Google Gemini.

---

## 📡 API Reference

### 1. `POST /api/chat`
Send a user prompt to be classified, grounded, and answered.

* **Request Body:**
  ```json
  {
    "message": "What is the fee per credit hour for BS Computer Science at ITU?",
    "history": [],
    "mode": "auto" 
  }
  ```
  *(Mode can be `"auto"`, `"itu"`, or `"general"`)*

* **Response Body:**
  ```json
  {
    "reply": "### 🎓 ITU Tuition & Fee Breakdown\n\nFor BS Computer Science (BSCS), the tuition fee is PKR 9,200 per credit hour...",
    "mode": "itu",
    "confidence": 0.95,
    "reason": "Matched ITU-specific intent and keywords (score: 5).",
    "groundedSources": [
      "ITU Fee & Scholarship Guidelines",
      "ITU Admissions Merit Criteria"
    ],
    "matchedTopics": ["fees"],
    "timestamp": "2026-10-18T17:15:00.000Z"
  }
  ```

### 2. `GET /api/knowledge`
Retrieves the complete structured ITU Knowledge Base JSON.

### 3. `GET /api/health`
Health check status confirming server uptime and Gemini API status.

---

## 🧪 Testing the Dual-Mode Persona

Try these prompts in ITU Nova to see prompt routing in action:

| Query | Classified Mode | Routing Behavior |
| :--- | :--- | :--- |
| *"What is the fee per credit hour for BSCS and BSAI?"* | **ITU Grounded** | Cites PKR 9,200 (BSCS) & PKR 9,500 (BSAI), typical semester totals, and scholarships. |
| *"How is the ITU aggregate merit calculated?"* | **ITU Grounded** | Explains 15% Matric + 35% Inter + 50% Test formula with worked example. |
| *"Show me Bus Route 1 stops and morning departure time"* | **ITU Grounded** | Details Thokar ➔ Canal View ➔ PU ➔ Jinnah Hospital ➔ ASTP with timings. |
| *"Write a Python script to sort a list using Merge Sort"* | **General AI** | Provides clean, syntax-highlighted code and algorithmic complexity without ITU constraints. |
| *"Explain how transformers work in Natural Language Processing"* | **General AI** | Explains attention mechanisms, self-attention, and encoder-decoder architecture. |

---

## 🛡️ License
Built for Information Technology University (ITU), Lahore.
