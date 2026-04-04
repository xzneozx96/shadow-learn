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

## Security Guidelines

### Secrets

- NEVER hardcode API keys, tokens, passwords, or credentials in any file
- Always use environment variable references: `${VAR_NAME}` or `process.env.VAR_NAME`
- Never echo, log, or print secret values to the terminal

### Permissions

- Never use `--dangerously-skip-permissions` or `--no-verify`
- Do not run `sudo` commands
- Do not use `rm -rf` without explicit user confirmation
- Do not use `chmod 777` on any file or directory

### Code Safety

- Validate all user inputs before processing
- Use parameterized queries for database operations
- Sanitize HTML output to prevent XSS
- Never execute dynamically constructed shell commands with user input

### MCP Servers

- Only connect to trusted, verified MCP servers
- Review MCP server permissions before enabling
- Do not pass secrets as command-line arguments to MCP servers
- Use environment variables for MCP server credentials

### Hooks

- All hooks must be reviewed before activation
- Hooks should not exfiltrate data or make external network calls
- PostToolUse hooks should validate output, not modify it silently
