# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShadowLearn is a Chinese language learning platform. Users create lessons from YouTube videos or file uploads, which are processed through a pipeline (download → transcription → pinyin → translation → vocabulary extraction). Lessons are studied through multiple exercise types, shadowing mode, and an AI companion chat.

## Architecture

### Backend (`backend/app/`)

**FastAPI** with an async service layer pattern. Entry point is `main.py`.

- `routers/` — HTTP route handlers (thin layer, delegates to services)
  - `lessons.py` — lesson generation pipeline with background jobs
  - `chat.py` — SSE-streamed AI chat via OpenRouter
  - `pronunciation.py` — Azure speech assessment
  - `quiz.py` — quiz generation via LLM
  - `tts.py` — TTS provider routing
  - `jobs.py` — in-memory background job status
- `services/` — business logic
  - `audio.py` — yt-dlp download, ffmpeg processing
  - `transcription.py` — Deepgram STT
  - `translation.py` — OpenRouter with Pydantic structured outputs
  - `vocabulary.py` — vocab extraction
  - `tts_factory.py` + `tts_provider.py` — factory + Protocol for Azure/Minimax TTS
- `models.py` — shared Pydantic models (`Word`, `Segment`, `LessonRequest`, etc.)
- `config.py` — `pydantic-settings` with `SHADOWLEARN_` env prefix; see `.env.example`

TTS provider is injected at startup via FastAPI lifespan and stored in `app.state.tts`.

### Frontend (`frontend/src/`)

**React 19** + **TypeScript** + **Vite**, offline-first via IndexedDB.

**State management** is Context API + custom hooks — no Redux or Zustand:
- `AuthContext` — PIN-based encryption; gates the entire app. Holds `DecryptedKeys` (API keys for OpenRouter, Deepgram, Azure, Minimax) and the `idb` database handle.
- `PlayerContext` — video playback state (time, rate, volume); subscribers hook in via `useTimeEffect`
- `LessonsContext` — cached lesson metadata
- `VocabularyContext` — vocabulary workbook state

**Persistence**: all user data lives in IndexedDB (`db/index.ts`, schema v3). Stores: `lessons`, `segments`, `videos`, `chats`, `tts-cache`, `vocabulary`, `settings`, `crypto`.

**Component layout**:
- `pages/` — top-level route pages
- `components/lesson/` — video player, transcript, companion chat, workbook panel
- `components/study/` — study session orchestrator + 7 exercise types (`exercises/`)
- `components/shadowing/` — listen → speak → reveal flow
- `components/ui/` — shadcn/ui primitives (do not hand-edit these)
- `lib/` — pure utilities (pinyin, shadowing, study logic, segment text)
- `hooks/` — data-fetching and feature hooks
- `contexts/` — React context providers

**Routing** is `react-router-dom` v7, configured in `App.tsx`.

**Styling**: Tailwind CSS v4 (no separate config file — uses `@tailwindcss/vite` plugin). Use `clsx` + `tailwind-merge` for conditional classes. ESLint uses `@antfu/eslint-config` — no Prettier.

## React Rules (enforced by ESLint)

**`react-hooks-extra/no-direct-set-state-in-use-effect`** — never call a `useState` setter directly inside `useEffect` or `useLayoutEffect`. Three approved alternatives:

1. **Derive during render** (preferred) — if the value can be computed from a ref or existing state/props, compute it inline during render. No effect needed.
   ```tsx
   // ✅ derive from ref during render
   const rect = showPopup ? wrapperRef.current?.getBoundingClientRect() : undefined
   const pos = rect ? { top: rect.bottom + 4, left: rect.left } : null
   ```

2. **Combine into one `useState`** — when two pieces of state must change atomically (e.g. resetting `page` when `buffer` changes), merge them into a single state object updated in one `setX` call inside an event handler. Never reset derived state via effect.
   ```tsx
   // ✅ atomic update in event handler
   const [ime, setIme] = useState({ buffer: '', page: 0 })
   // on keydown: setIme({ buffer: newBuffer, page: 0 })
   ```

3. **setState-during-render with a guard** — when state must change in response to a prop/state transition that can't be expressed as a pure derivation (e.g. auto-skip cascades, syncing form fields when async data arrives). Track what you've already processed with a `prev` state variable; React re-renders immediately and only once more.
   ```tsx
   // ✅ sync form fields when async `keys` prop arrives
   const [prevKeys, setPrevKeys] = useState(keys)
   if (prevKeys !== keys) {
     setPrevKeys(keys)
     setEditField(keys?.field ?? '')
   }

   // ✅ auto-skip cascade (advance past ineligible items)
   const [lastAutoSkipCheck, setLastAutoSkipCheck] = useState(-1)
   if (phase === 'session' && lastAutoSkipCheck !== current) {
     setLastAutoSkipCheck(current)
     if (shouldSkip(questions[current]))
       handleNext(false)
   }
   ```