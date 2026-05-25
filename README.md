# ShadowLearn

A Chinese language learning platform built around the **shadowing technique**. Upload a YouTube video or audio file, and ShadowLearn turns it into an interactive lesson — with transcription, pinyin, translation, vocabulary extraction, and a full study suite.

![Tech Stack](https://img.shields.io/badge/React-19-61DAFB?logo=react) ![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38BDF8?logo=tailwindcss)

---

## Features

- **Lesson creation** — paste a YouTube URL or upload a video/audio file; the backend handles download, transcription, pinyin annotation, translation, and vocabulary extraction automatically
- **Shadowing mode** — listen → speak → reveal flow with per-segment audio playback and recording
- **Study sessions** — 7 exercise types: cloze, reconstruction, translation, character writing, and more; driven by spaced repetition
- **AI companion** — in-lesson chat powered by OpenRouter for grammar questions and explanations
- **Vocabulary workbook** — review and track words across all lessons
- **Progress tracking** — skill mastery grid, accuracy trends, mistake history, review queue
- **Offline-first** — all user data lives in IndexedDB; no account required
- **Secure** — API keys are stored encrypted (PIN-protected AES-256) in the browser; never sent to the backend

---

## Tech Stack

| Layer | Stack |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui |
| State | Context API + custom hooks, IndexedDB (idb) |
| Backend | FastAPI, Python 3.12, uv |
| Transcription | Deepgram (default) or Azure Speech |
| TTS | Azure Neural TTS (default) or Minimax |
| Translation / LLM | OpenRouter (Qwen, etc.) |
| Deployment | Docker Compose or split (Vercel + HF Spaces) |

---

## AI Companion — Harness Architecture

The AI companion is not a single LLM call — it's an engineered agent harness. A turn flows through five layers and loops back.

### The Layers (one turn flows top → bottom → back)

```mermaid
flowchart TD
    U([User message])

    subgraph PROMPT[" 1 · Prompt Assembly "]
        direction TB
        P1[Role + behaviour instructions]
        P2[Grammar &amp; learning protocols]
        P3[Learner profile · memory · session state]
        P4[Cache-stable prefix → cheap reuse]
    end

    subgraph LOOP[" 2 · Agent Loop "]
        direction TB
        L1[Stream model response]
        L2{Model wants<br/>a tool?}
        L3[Auto-resubmit with results<br/>up to N rounds]
    end

    subgraph TOOLS[" 3 · Tool Calling "]
        direction TB
        T1[Tool definitions<br/>name · purpose · when-to-use]
        T2[Executor<br/>parallel-safe vs serialized]
        T3[(Data tools<br/>RAG · vocabulary · memory · study context)]
        T4[(Render tools<br/>study session · vocab card · charts)]
        T5[(Guidance tools<br/>teaching guidelines &amp; manuals)]
    end

    subgraph CTX[" 4 · Context Management "]
        direction TB
        C1[Track real token usage per turn]
        C2{Over budget?}
        C3[Compact: keep recent turns whole,<br/>summarize older into structured recap]
        C4[Strip stale tool output,<br/>protect active RAG passages]
    end

    subgraph BACK[" 5 · Backend &amp; Knowledge "]
        direction TB
        B1[Streaming model gateway]
        B2[RAG pipeline:<br/>route → retrieve → ground]
        B3[(Persisted chats<br/>+ summaries)]
    end

    U --> PROMPT --> LOOP
    L1 --> L2
    L2 -- yes --> TOOLS
    T1 --> T2 --> T3 & T4 & T5
    TOOLS -- results --> L3 --> L1
    L2 -- no --> CTX
    C1 --> C2
    C2 -- yes --> C3 --> C4 --> BACK
    C2 -- no --> BACK
    B2 -.grounds.-> T3
    BACK --> A([Grounded answer + source link])
```

### One Turn, End to End

```mermaid
sequenceDiagram
    participant U as Learner
    participant H as Harness
    participant M as Model
    participant T as Tools / RAG
    participant X as Context Mgr

    U->>H: "的 得 地 are so confusing…"
    H->>H: Assemble prompt (protocols + profile,<br/>cached prefix reused)
    H->>M: Stream request
    M-->>H: Intent: this is a grammar struggle → search
    H->>T: search knowledge base
    T-->>H: Verbatim passages + source URL
    H->>M: Resubmit grounded with passages
    M-->>H: Explanation grounded in source
    H->>X: Record real token usage
    alt Over budget
        X->>X: Keep recent turns whole,<br/>summarize older, protect active RAG
    end
    H-->>U: Answer + "watch the source" link
```

### Engineering Wins

- **Infers intent** — fires retrieval on *implicit* struggle, not just explicit questions.
- **Grounded, not guessed** — grammar answers come from retrieved source passages, always cited.
- **Agentic loop** — multi-round tool use, not single-shot.
- **Never dead-ends** — compaction keeps long sessions alive instead of "start a new chat."
- **Cost-aware** — stable prompt prefix → cache hits → lower latency &amp; spend.

---

## Getting Started

### Prerequisites

- Node.js 20+ and [pnpm](https://pnpm.io/installation)
- Python 3.12+ and [uv](https://docs.astral.sh/uv/)
- `ffmpeg` installed on the system (required for audio processing)
- API keys — see [API Keys](#api-keys) below

### 1. Clone the repo

```bash
git clone https://github.com/xzneozx96/shadow-learn.git
cd shadow-learn
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Fill in SHADOWLEARN_TTS_PROVIDER and any optional overrides in .env
uv sync
uv run uvicorn app.main:app --reload
```

The backend runs at `http://localhost:8000`.

### 3. Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

The frontend runs at `http://localhost:5173`.

On first launch, the app will prompt you to set a PIN and enter your API keys. These are encrypted and stored locally — they are never sent to the ShadowLearn backend.

---

## API Keys

ShadowLearn uses third-party APIs for speech and AI features. You enter them once in the app's setup screen:

| Key | Where to get it | Required? |
|---|---|---|
| **OpenRouter** | [openrouter.ai/keys](https://openrouter.ai/keys) | Yes — translation, LLM chat, quiz generation |
| **Deepgram** | [console.deepgram.com](https://console.deepgram.com) | Yes (default STT) |
| **Azure Speech key + region** | [Azure portal](https://portal.azure.com) → Azure AI Services | Yes (default TTS + optional STT) |
| **Minimax** | [minimax.io](https://minimax.io) | Only if using Minimax TTS |

---

## Docker Compose (full stack)

```bash
cp backend/.env.example backend/.env
# Edit backend/.env as needed
docker compose up --build
```

The app will be available at `http://localhost`.

---

## Deployment

**Frontend → Vercel**

1. Import the repo in Vercel
2. Set root directory to `frontend`, build command `pnpm build`, output directory `dist`
3. Add env var `VITE_API_BASE=<your-backend-url>` in Vercel project settings

**Backend → Hugging Face Spaces (Docker)**

HF Spaces Docker SDK gives 16 GB RAM / 2 vCPU free. Create a new Space with SDK: Docker, push the `backend/` directory, and add secret env vars (`AZURE_SPEECH_KEY`, `DEEPGRAM_API_KEY`, etc.) in the Space settings.

---

## Project Structure

```
shadow-learn/
├── backend/               # FastAPI application
│   ├── app/
│   │   ├── routers/       # HTTP handlers (lessons, chat, tts, quiz, …)
│   │   ├── services/      # Business logic (audio, transcription, translation, …)
│   │   ├── models.py      # Shared Pydantic models
│   │   └── config.py      # pydantic-settings (SHADOWLEARN_ env prefix)
│   └── tests/
├── frontend/              # React + Vite application
│   ├── src/
│   │   ├── components/    # UI — lesson, study, shadowing, progress, ui primitives
│   │   ├── contexts/      # AuthContext, PlayerContext, LessonsContext, VocabularyContext
│   │   ├── hooks/         # Feature hooks (TTS, pronunciation, quiz, tracking, …)
│   │   ├── lib/           # Pure utilities (pinyin, shadowing logic, spaced repetition, …)
│   │   ├── pages/         # Top-level route pages
│   │   └── db/            # IndexedDB schema and typed accessors
│   └── tests/
└── docker-compose.yml
```

---

## Development

```bash
# Backend tests (install dev deps first)
cd backend && uv sync --extra dev && uv run pytest

# Frontend tests
cd frontend && pnpm test

# Frontend lint
cd frontend && pnpm lint
```

---

## License

MIT
