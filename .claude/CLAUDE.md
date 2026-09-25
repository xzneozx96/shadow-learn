# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShadowLearn is a Chinese language learning platform. Users sign in with an email and password, then create lessons from YouTube videos, file uploads, or blog articles. The backend processes each lesson through a pipeline (download → transcription → pinyin → translation → vocabulary extraction) and stores it on the server. Lessons are studied through multiple exercise types, shadowing mode, and an AI companion chat.

The server is the only source of truth. The browser keeps only the session tokens, placeholders for lessons that are still processing, and UI preferences in `localStorage`.

## Architecture

### Backend (`backend/app/`)

**FastAPI** with one package per feature. Each package holds its `router.py`, and most also hold `models.py` (SQLAlchemy), `schemas.py`, and a `service.py` or `services/`. Entry point is `main.py`, which mounts every router behind `current_active_user` except auth, config, media, and internal.

- **Storage.** Postgres holds records (async SQLAlchemy in `db.py`, migrations in `backend/alembic/versions/`, `uv run alembic upgrade head`). MinIO (S3) holds media (`storage.py`). `GET /api/health/deps` reports both.
- `accounts/` — email and password accounts (fastapi-users). Short-lived JWT access tokens and rotating refresh tokens; logout bumps `token_version`, which revokes every token. Password reset mails through SMTP.
- `keys/` — provider keys (OpenRouter, Deepgram, Azure, Minimax, Google) held server-side, encrypted with Fernet under `SHADOWLEARN_ENCRYPTION_KEY`. `KeyResolver` uses the account's own key, then falls back to the operator's env key, with per-account rate limiting and usage rows. A client can write a key but never reads one back; Settings shows only its source and last four characters.
- `userdata/` — `/api/store/{store}` serves every client-written store (vocabulary, study progress, threads, settings, tips, and more). `specs.py` defines the stores. Rows carry a version: GET returns it as the `ETag`, and a PUT or DELETE with `If-Match` gets 409 with the current record when another device wrote first. `POST /bulk` with `mode: "import"` applies the per-store merge rules in `merge.py`.
- `lessons/` — the generation pipeline as background jobs (`jobs/`, `job_store.py`), and `/api/lessons` to list, read, rename, update, and delete lessons. The lesson PATCH follows the same version, `If-Match`, and 409 contract as `/api/store`.
- `media/` — lesson video and audio plus shadowing recordings in MinIO. Streams support Range, and the browser reads them with short-lived `?token=` tickets from `POST /api/media/{id}/ticket`.
- `importer/` — the one-time import of a device's legacy IndexedDB data. It imports lessons and media, quarantines records that fail validation or conflict with the account's copy (the repair queue, readable only through SQL for now), and serves the manifest the browser verifies before it deletes its local copy.
- `speak/`, `agent/`, `tts/`, `transcription/`, `translation/`, `pronunciation/`, `quiz/`, `vocab/`, `tips/`, `collection/`, `catalog/`, `daily_review/` — feature routers. `internal/` serves the LiveKit agent in `backend/livekit_agent/`.
- `settings.py` — `pydantic-settings` with the `SHADOWLEARN_` env prefix; see `backend/.env.example`. Startup refuses a bad Fernet key, short JWT secrets, missing SMTP outside local dev, and test routes outside local dev.

Run one uvicorn worker. The job sweep at startup and the rate limiter live in process.

### Frontend (`frontend/src/`)

**React 19** + **TypeScript** + **Vite**, online only. Every read and write goes to the backend.

- `app/` — `App.tsx` (routes, `react-router-dom` v7), `Layout.tsx`, pages, and the app-wide providers in `app/providers/`: `AuthContext` (login session and the `DataClient`), `I18nContext`, and `PlayerContext` (video playback state; subscribe with `useTimeEffect`).
- `features/<feature>/` — `agent`, `learning-materials`, `lesson`, `migration`, `settings`, `shadowing`, `speak`, `study`, `vocabulary`. Each splits into `application/` (hooks and contexts), `domain/` (types and pure logic), `ui/` (components), and sometimes `lib/` or `api/`.
- `shared/` — `ui/` (shadcn/ui primitives, do not hand-edit), `lib/` (pure utilities, `api.ts` with `apiFetch` and token refresh, `i18n.ts`), `hooks/`, and `types.ts`.
- `db/` — `client.ts` defines `ApiClient` (`get`, `getVersioned`, `putVersioned`, `list`, `put`, `del`, `bulk`, `fetch`). `index.ts` holds the typed accessors for `/api/store`, `/api/lessons`, and media. Read-modify-write goes through `updateRecord(db, store, id, mutate)` or `updateLessonMeta(db, meta, mutate)`, which retry `mutate` on the other device's record after a 409. `legacy.ts` is the read-only v21 IndexedDB schema and upgrade path that the importer reads; nothing else opens IndexedDB.

**State management** is Context API + custom hooks — no Redux or Zustand. `useAuth().db` is the `DataClient` for the signed-in account, or `null` before sign-in.

**Import.** `features/migration/` runs once per device that still holds a legacy `shadowlearn` IndexedDB database. It decrypts old PIN-protected keys with `legacyCrypto.ts`, uploads records and media, verifies them against the server manifest, and deletes the local database only on a full match.

**Styling**: Tailwind CSS v4 (no separate config file — uses `@tailwindcss/vite` plugin). Use `clsx` + `tailwind-merge` for conditional classes. ESLint uses `@antfu/eslint-config` — no Prettier.

### Deploy

`docs/deploy-server-migration.md` lists what a deploy of this architecture needs: the Fernet key and its backup, the Google key move, `SHADOWLEARN_BACKEND_URL` for the offshore agent, nginx rules for media tickets and large uploads, one worker, `stop_grace_period`, and the speak test after deploy.

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
