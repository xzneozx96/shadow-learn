# ShadowLearn Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development
> (if subagents available) or superpowers:executing-plans to implement this
> plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted web app for learning Mandarin Chinese via the
shadowing method — feed it a video, get an interactive lesson with synchronized
transcript, pinyin, translations, word explanations, and AI chat.

**Architecture:** Two-service Docker Compose setup. A stateless Python/FastAPI
backend handles video processing, transcription (ElevenLabs Scribe), pinyin
generation (pypinyin), and translation (OpenRouter). A React/Vite frontend
stores all lesson data in IndexedDB with AES-GCM encrypted API keys. Video
playback uses a unified VideoPlayer interface wrapping YouTube IFrame API and
HTML5 `<video>`.

**Tech Stack:** React + Vite + TypeScript (frontend), shadcn/ui + Tailwind CSS
(UI components), ESLint with @antfu/eslint-config (linting, no prettier),
Python + FastAPI (backend), IndexedDB via `idb` (storage), Web Crypto API
(encryption), yt-dlp + ffmpeg (audio), ElevenLabs Scribe (STT), pypinyin
(pinyin), OpenRouter (translation + chat), Docker Compose + nginx (deployment).

**Frontend guidelines:** All UI components must use shadcn/ui where applicable
(Button, Input, Card, Dialog, Tabs, Select, Tooltip, etc.) instead of raw
Tailwind markup. ESLint uses `@antfu/eslint-config` only — no prettier. Follow
React best practices (proper hooks, memoization, clean component boundaries) and
web design guidelines (accessibility, consistent spacing, keyboard navigation).

---

## File Structure

```
shadowing-companion/
├── docker-compose.yml
├── nginx.conf
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                    # FastAPI app, CORS, router mounting
│   │   ├── config.py                  # Pydantic Settings (env vars)
│   │   ├── models.py                  # Request/response Pydantic models
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── lessons.py             # POST /api/lessons/generate (SSE)
│   │   │   └── chat.py                # POST /api/chat (streaming)
│   │   └── services/
│   │       ├── __init__.py
│   │       ├── validation.py          # URL/file validation + duration check
│   │       ├── audio.py               # yt-dlp download + ffmpeg extraction
│   │       ├── transcription.py       # ElevenLabs Scribe client
│   │       ├── pinyin.py              # pypinyin wrapper
│   │       └── translation.py         # OpenRouter batched translation
│   └── tests/
│       ├── conftest.py
│       ├── test_validation.py
│       ├── test_audio.py
│       ├── test_transcription.py
│       ├── test_pinyin.py
│       ├── test_translation.py
│       ├── test_lessons_router.py
│       └── test_chat_router.py
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   ├── eslint.config.js                  # @antfu/eslint-config
│   ├── components.json                   # shadcn/ui config
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx                   # React entry point
│   │   ├── App.tsx                    # Router setup + context providers
│   │   ├── types.ts                   # Shared TypeScript interfaces
│   │   ├── db/
│   │   │   └── index.ts              # IndexedDB schema + CRUD operations
│   │   ├── crypto/
│   │   │   └── index.ts              # PBKDF2 key derivation + AES-GCM encrypt/decrypt
│   │   ├── contexts/
│   │   │   ├── AuthContext.tsx        # PIN unlock state + decrypted API keys
│   │   │   └── PlayerContext.tsx      # Active VideoPlayer instance + current time
│   │   ├── hooks/
│   │   │   ├── useLesson.ts           # Load lesson + segments from IndexedDB
│   │   │   ├── useChat.ts             # Chat state + OpenRouter streaming
│   │   │   └── useActiveSegment.ts    # Derive active segment from current time
│   │   ├── player/
│   │   │   ├── types.ts              # VideoPlayer interface
│   │   │   ├── YouTubePlayer.ts      # YouTube IFrame API wrapper
│   │   │   └── HTML5Player.ts        # <video> element wrapper
│   │   ├── components/
│   │   │   ├── Layout.tsx             # Top nav bar + page container
│   │   │   ├── library/
│   │   │   │   ├── Library.tsx        # Grid of LessonCards + search/sort
│   │   │   │   └── LessonCard.tsx     # Individual lesson card
│   │   │   ├── create/
│   │   │   │   ├── CreateLesson.tsx   # Tab switcher + form + processing
│   │   │   │   ├── YouTubeTab.tsx     # YouTube URL input
│   │   │   │   ├── UploadTab.tsx      # Drag-and-drop file upload
│   │   │   │   └── ProcessingStatus.tsx # Live step-by-step progress
│   │   │   ├── lesson/
│   │   │   │   ├── LessonView.tsx     # 3-panel layout container
│   │   │   │   ├── VideoPanel.tsx     # Video player + custom controls
│   │   │   │   ├── TranscriptPanel.tsx # Scrollable segment list + search
│   │   │   │   ├── CompanionPanel.tsx # AI chat panel
│   │   │   │   └── WordTooltip.tsx    # Hover tooltip for word explanations
│   │   │   ├── settings/
│   │   │   │   └── Settings.tsx       # Settings page with sections
│   │   │   └── onboarding/
│   │   │       └── Setup.tsx          # First-launch setup wizard
│   │   └── styles/
│   │       └── index.css              # Tailwind + global styles
│   └── tests/
│       ├── setup.ts                   # Vitest setup (jsdom, mocks)
│       ├── db.test.ts
│       ├── crypto.test.ts
│       ├── player.test.ts
│       └── components/
│           ├── Library.test.tsx
│           ├── CreateLesson.test.tsx
│           ├── LessonView.test.tsx
│           └── Settings.test.tsx
```

---

## Chunk 1: Project Scaffolding + Backend Foundation

### Task 1: Initialize Backend Python Project

**Files:**

- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`

- [ ] **Step 1: Create `backend/pyproject.toml`**

```toml
[project]
name = "shadowlearn-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.34.0",
    "python-multipart>=0.0.18",
    "yt-dlp>=2024.12.0",
    "ffmpeg-python>=0.2.0",
    "pypinyin>=0.53.0",
    "httpx>=0.28.0",
    "pydantic-settings>=2.7.0",
    "sse-starlette>=2.2.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.25.0",
    "httpx>=0.28.0",
    "respx>=0.22.0",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 2: Create `backend/app/__init__.py`**

Empty file.

- [ ] **Step 3: Create `backend/app/config.py`**

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    max_video_duration_seconds: int = 7200  # 2 hours
    max_upload_size_bytes: int = 2_147_483_648  # 2 GB
    allowed_video_formats: list[str] = ["mp4", "mkv", "webm", "mov"]
    translation_batch_size: int = 30
    translation_max_retries: int = 2
    openrouter_chat_url: str = "https://openrouter.ai/api/v1/chat/completions"

    model_config = {"env_prefix": "SHADOWLEARN_"}


settings = Settings()
```

- [ ] **Step 4: Create `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ShadowLearn API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Install dependencies and verify server starts**

```bash
cd backend && pip install -e ".[dev]"
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
curl http://localhost:8000/api/health
kill %1  # stop background server
```

Expected: `{"status":"ok"}`

- [ ] **Step 6: Commit**

```bash
git add backend/pyproject.toml backend/app/__init__.py backend/app/config.py backend/app/main.py
git commit -m "feat: initialize backend with FastAPI skeleton and config"
```

---

### Task 2: Backend Pydantic Models

**Files:**

- Create: `backend/app/models.py`
- Create: `backend/app/routers/__init__.py`

- [ ] **Step 1: Create `backend/app/models.py`**

```python
from pydantic import BaseModel, Field


class Word(BaseModel):
    word: str
    pinyin: str
    meaning: str
    usage: str


class Segment(BaseModel):
    id: str
    start: float
    end: float
    chinese: str
    pinyin: str
    translations: dict[str, str]
    words: list[Word]


class LessonRequest(BaseModel):
    source: str = Field(pattern=r"^(youtube|upload)$")
    youtube_url: str | None = None
    translation_languages: list[str] = Field(min_length=1)
    openrouter_api_key: str
    openrouter_model: str
    elevenlabs_api_key: str


class LessonResponse(BaseModel):
    title: str
    source: str
    source_url: str | None
    duration: float
    segments: list[Segment]
    translation_languages: list[str]


class ChatMessageInput(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessageInput]
    video_title: str
    active_segment: Segment | None
    context_segments: list[Segment]
    openrouter_api_key: str
    openrouter_model: str
```

- [ ] **Step 2: Create `backend/app/routers/__init__.py`**

Empty file.

- [ ] **Step 3: Commit**

```bash
git add backend/app/models.py backend/app/routers/__init__.py
git commit -m "feat: add Pydantic request/response models"
```

---

### Task 3: Input Validation Service

**Files:**

- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/validation.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_validation.py`

- [ ] **Step 1: Write failing tests for validation**

Create `backend/tests/conftest.py` (empty file).

Create `backend/tests/test_validation.py`:

```python
import pytest
from app.services.validation import validate_youtube_url, ValidationError


def test_valid_youtube_url():
    url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    video_id = validate_youtube_url(url)
    assert video_id == "dQw4w9WgXcQ"


def test_valid_short_youtube_url():
    url = "https://youtu.be/dQw4w9WgXcQ"
    video_id = validate_youtube_url(url)
    assert video_id == "dQw4w9WgXcQ"


def test_invalid_youtube_url():
    with pytest.raises(ValidationError, match="Invalid YouTube URL"):
        validate_youtube_url("https://example.com/video")


def test_empty_youtube_url():
    with pytest.raises(ValidationError, match="Invalid YouTube URL"):
        validate_youtube_url("")


def test_youtube_url_with_extra_params():
    url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30"
    video_id = validate_youtube_url(url)
    assert video_id == "dQw4w9WgXcQ"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_validation.py -v` Expected: FAIL
with `ModuleNotFoundError` or `ImportError`

- [ ] **Step 3: Implement validation service**

Create `backend/app/services/__init__.py` (empty file).

Create `backend/app/services/validation.py`:

```python
import re
from urllib.parse import urlparse, parse_qs

from app.config import settings


class ValidationError(Exception):
    """Raised when input validation fails."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


_YOUTUBE_PATTERNS = [
    re.compile(r"(?:youtube\.com/watch\?.*v=)([\w-]{11})"),
    re.compile(r"(?:youtu\.be/)([\w-]{11})"),
    re.compile(r"(?:youtube\.com/embed/)([\w-]{11})"),
]


def validate_youtube_url(url: str) -> str:
    """Extract and return video ID from a YouTube URL, or raise ValidationError."""
    for pattern in _YOUTUBE_PATTERNS:
        match = pattern.search(url)
        if match:
            return match.group(1)
    raise ValidationError("Invalid YouTube URL. Please provide a valid YouTube link.")


def validate_upload_file(filename: str, size_bytes: int) -> None:
    """Validate an uploaded video file's format and size."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in settings.allowed_video_formats:
        allowed = ", ".join(settings.allowed_video_formats)
        raise ValidationError(
            f"Unsupported format '.{ext}'. Accepted formats: {allowed}"
        )
    if size_bytes > settings.max_upload_size_bytes:
        max_gb = settings.max_upload_size_bytes / (1024**3)
        raise ValidationError(f"File exceeds the {max_gb:.0f} GB size limit.")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_validation.py -v` Expected: All
5 tests PASS

- [ ] **Step 5: Add upload validation tests**

Append to `backend/tests/test_validation.py`:

```python
from app.services.validation import validate_upload_file


def test_valid_upload_file():
    validate_upload_file("video.mp4", 500_000_000)  # should not raise


def test_upload_invalid_format():
    with pytest.raises(ValidationError, match="Unsupported format"):
        validate_upload_file("video.avi", 100)


def test_upload_too_large():
    with pytest.raises(ValidationError, match="size limit"):
        validate_upload_file("video.mp4", 3_000_000_000)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_validation.py -v` Expected: All
8 tests PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/ backend/tests/
git commit -m "feat: add input validation service with URL and file checks"
```

---

### Task 4: Initialize Frontend React Project

**Files:**

- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/types.ts`
- Create: `frontend/src/styles/index.css`

- [ ] **Step 1: Scaffold the Vite project**

```bash
mkdir -p frontend && cd frontend
npm create vite@latest . -- --template react-ts
```

This generates `package.json`, `tsconfig.json`, `tsconfig.node.json`,
`index.html`, and starter files. Remove the generated `src/App.css`,
`src/index.css`, and `src/assets/` — we will replace them.

- [ ] **Step 2: Install additional dependencies**

```bash
cd frontend && npm install react-router-dom idb
npm install -D tailwindcss @tailwindcss/vite vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2a: Set up ESLint with @antfu/eslint-config**

```bash
cd frontend && npm install -D eslint @antfu/eslint-config
```

Create `frontend/eslint.config.js`:

```javascript
import antfu from '@antfu/eslint-config';

export default antfu({
	react: true,
	typescript: true,
});
```

Add to `frontend/package.json` scripts:

```json
"lint": "eslint .",
"lint:fix": "eslint . --fix"
```

- [ ] **Step 2b: Initialize shadcn/ui**

```bash
cd frontend && npx shadcn@latest init
```

When prompted, select: New York style, Slate base color, CSS variables enabled.
This creates `components.json` and sets up the `src/components/ui/` directory.

Install the core shadcn components used throughout the app:

```bash
cd frontend && npx shadcn@latest add button input card dialog tabs select tooltip textarea badge scroll-area separator
```

- [ ] **Step 3: Configure Vite with proxy and Tailwind**

Write `frontend/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [react(), tailwindcss()],
	server: {
		port: 5173,
		proxy: {
			'/api': {
				target: 'http://localhost:8000',
				changeOrigin: true,
			},
		},
	},
	test: {
		environment: 'jsdom',
		setupFiles: ['./tests/setup.ts'],
		globals: true,
	},
});
```

- [ ] **Step 4: Create `frontend/src/styles/index.css`**

```css
@import 'tailwindcss';
```

- [ ] **Step 5: Create shared TypeScript types**

Write `frontend/src/types.ts`:

```typescript
export interface Word {
	word: string;
	pinyin: string;
	meaning: string;
	usage: string;
}

export interface Segment {
	id: string;
	start: number;
	end: number;
	chinese: string;
	pinyin: string;
	translations: Record<string, string>;
	words: Word[];
}

export interface LessonMeta {
	id: string;
	title: string;
	source: 'youtube' | 'upload';
	sourceUrl: string | null;
	duration: number;
	segmentCount: number;
	translationLanguages: string[];
	createdAt: string;
	lastOpenedAt: string;
	progressSegmentId: string | null;
	tags: string[];
}

export interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
	timestamp: string;
}

export interface AppSettings {
	translationLanguage: string;
	defaultModel: string;
}

export interface DecryptedKeys {
	elevenlabsApiKey: string;
	openrouterApiKey: string;
}
```

- [ ] **Step 6: Create App.tsx with router skeleton**

Write `frontend/src/App.tsx`:

```typescript
import { BrowserRouter, Routes, Route } from "react-router-dom";

function Placeholder({ name }: { name: string }) {
  return <div className="p-8 text-white">{name} — coming soon</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Placeholder name="Library" />} />
        <Route path="/create" element={<Placeholder name="Create Lesson" />} />
        <Route path="/lesson/:id" element={<Placeholder name="Lesson View" />} />
        <Route path="/settings" element={<Placeholder name="Settings" />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 7: Update `frontend/src/main.tsx`**

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 8: Create test setup**

Create `frontend/tests/setup.ts`:

```typescript
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 9: Verify dev server starts**

```bash
cd frontend && npm run dev -- --host 0.0.0.0 &
sleep 3 && curl -s http://localhost:5173 | head -5
kill %1  # stop dev server
```

Expected: HTML containing `<div id="root">`

- [ ] **Step 10: Commit**

```bash
git add frontend/
git commit -m "feat: initialize frontend with Vite, React Router, Tailwind, and shared types"
```

---

## Chunk 2: Backend Processing Pipeline

### Task 5: Audio Extraction Service

**Files:**

- Create: `backend/app/services/audio.py`
- Create: `backend/tests/test_audio.py`

- [ ] **Step 1: Write failing tests for audio extraction**

Create `backend/tests/test_audio.py`:

```python
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from pathlib import Path

from app.services.audio import extract_audio_from_youtube, extract_audio_from_upload


@pytest.mark.asyncio
async def test_extract_audio_from_youtube_calls_ytdlp():
    with patch("app.services.audio.asyncio.to_thread") as mock_thread:
        mock_thread.return_value = None
        # Mock the temp file to exist
        with patch("app.services.audio.Path.exists", return_value=True):
            result = await extract_audio_from_youtube("dQw4w9WgXcQ")
            assert result.suffix == ".mp3"
            mock_thread.assert_called_once()


@pytest.mark.asyncio
async def test_extract_audio_from_youtube_raises_on_failure():
    with patch("app.services.audio.asyncio.to_thread", side_effect=Exception("download failed")):
        with pytest.raises(Exception, match="download failed"):
            await extract_audio_from_youtube("bad_id")


@pytest.mark.asyncio
async def test_extract_audio_from_upload_calls_ffmpeg():
    with patch("app.services.audio.asyncio.to_thread") as mock_thread:
        mock_thread.return_value = None
        with patch("app.services.audio.Path.exists", return_value=True):
            result = await extract_audio_from_upload(Path("/tmp/video.mp4"))
            assert result.suffix == ".mp3"
            mock_thread.assert_called_once()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_audio.py -v` Expected: FAIL with
`ImportError`

- [ ] **Step 3: Implement audio extraction service**

Create `backend/app/services/audio.py`:

```python
import asyncio
import tempfile
import uuid
from pathlib import Path

import yt_dlp
import ffmpeg


async def extract_audio_from_youtube(video_id: str) -> Path:
    """Download audio from YouTube video and return path to mp3 file."""
    output_path = Path(tempfile.gettempdir()) / f"{uuid.uuid4()}.mp3"

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": str(output_path.with_suffix(".%(ext)s")),
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        ],
        "quiet": True,
        "no_warnings": True,
    }

    def _download():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([f"https://www.youtube.com/watch?v={video_id}"])

    await asyncio.to_thread(_download)

    if not output_path.exists():
        raise RuntimeError(f"Audio extraction failed for video {video_id}")

    return output_path


async def extract_audio_from_upload(video_path: Path) -> Path:
    """Extract audio from an uploaded video file and return path to mp3 file."""
    output_path = Path(tempfile.gettempdir()) / f"{uuid.uuid4()}.mp3"

    def _extract():
        (
            ffmpeg.input(str(video_path))
            .output(str(output_path), acodec="libmp3lame", ab="192k")
            .overwrite_output()
            .run(quiet=True)
        )

    await asyncio.to_thread(_extract)

    if not output_path.exists():
        raise RuntimeError("Audio extraction from uploaded file failed")

    return output_path


async def get_youtube_duration(video_id: str) -> float:
    """Probe a YouTube video's duration in seconds using yt-dlp metadata."""

    def _probe():
        ydl_opts = {"quiet": True, "no_warnings": True}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(
                f"https://www.youtube.com/watch?v={video_id}", download=False
            )
            return info.get("duration", 0)

    return await asyncio.to_thread(_probe)


async def probe_upload_duration(video_path: Path) -> float:
    """Probe an uploaded video file's duration in seconds using ffprobe."""

    def _probe():
        probe = ffmpeg.probe(str(video_path))
        return float(probe["format"].get("duration", 0))

    return await asyncio.to_thread(_probe)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_audio.py -v` Expected: All 3
tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/audio.py backend/tests/test_audio.py
git commit -m "feat: add audio extraction service for YouTube and uploaded files"
```

---

### Task 6: Transcription Service (ElevenLabs Scribe)

**Files:**

- Create: `backend/app/services/transcription.py`
- Create: `backend/tests/test_transcription.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_transcription.py`:

```python
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from pathlib import Path

from app.services.transcription import transcribe_audio


@pytest.mark.asyncio
async def test_transcribe_audio_returns_segments():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "words": [
            {"text": "你好", "start": 0.0, "end": 0.5, "type": "word"},
            {"text": "世界", "start": 0.6, "end": 1.0, "type": "word"},
        ],
    }

    with patch("app.services.transcription.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post.return_value = mock_response
        mock_client_cls.return_value = mock_client

        segments = await transcribe_audio(Path("/tmp/test.mp3"), "fake-api-key")

        assert len(segments) > 0
        assert "start" in segments[0]
        assert "end" in segments[0]
        assert "text" in segments[0]


@pytest.mark.asyncio
async def test_transcribe_audio_raises_on_api_error():
    mock_response = MagicMock()
    mock_response.status_code = 401
    mock_response.text = "Invalid API key"
    mock_response.raise_for_status.side_effect = Exception("401 Unauthorized")

    with patch("app.services.transcription.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post.return_value = mock_response
        mock_client_cls.return_value = mock_client

        with pytest.raises(Exception):
            await transcribe_audio(Path("/tmp/test.mp3"), "bad-key")


def test_group_words_splits_on_punctuation():
    from app.services.transcription import _group_words_into_segments

    words = [
        {"text": "你好", "start": 0.0, "end": 0.3, "type": "word"},
        {"text": "世界。", "start": 0.4, "end": 0.8, "type": "word"},
        {"text": "今天", "start": 1.0, "end": 1.3, "type": "word"},
        {"text": "好。", "start": 1.4, "end": 1.7, "type": "word"},
    ]
    segments = _group_words_into_segments(words)
    assert len(segments) == 2
    assert segments[0]["text"] == "你好世界。"
    assert segments[1]["text"] == "今天好。"


def test_group_words_splits_on_gap():
    from app.services.transcription import _group_words_into_segments

    words = [
        {"text": "你好", "start": 0.0, "end": 0.5, "type": "word"},
        {"text": "世界", "start": 3.0, "end": 3.5, "type": "word"},  # 2.5s gap
    ]
    segments = _group_words_into_segments(words)
    assert len(segments) == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_transcription.py -v` Expected:
FAIL with `ImportError`

- [ ] **Step 3: Implement transcription service**

Create `backend/app/services/transcription.py`:

```python
from pathlib import Path

import httpx

ELEVENLABS_SCRIBE_URL = "https://api.elevenlabs.io/v1/speech-to-text"


async def transcribe_audio(
    audio_path: Path, api_key: str
) -> list[dict]:
    """Send audio to ElevenLabs Scribe and return word-level segments.

    Returns a list of dicts: [{"text": str, "start": float, "end": float}, ...]
    grouped into sentence-level segments from word-level timestamps.
    """
    async with httpx.AsyncClient(timeout=300.0) as client:
        with open(audio_path, "rb") as f:
            response = await client.post(
                ELEVENLABS_SCRIBE_URL,
                headers={"xi-api-key": api_key},
                files={"file": ("audio.mp3", f, "audio/mpeg")},
                data={"language_code": "zho"},
            )

        if response.status_code != 200:
            raise RuntimeError(
                f"Transcription failed: {response.text}"
            )

        data = response.json()

    return _group_words_into_segments(data.get("words", []))


def _group_words_into_segments(
    words: list[dict],
) -> list[dict]:
    """Group word-level timestamps into sentence segments.

    Splits on sentence-ending punctuation (。！？) or when gap > 1.5s.
    """
    if not words:
        return []

    segments: list[dict] = []
    current_words: list[dict] = []
    sentence_enders = {"。", "！", "？", ".", "!", "?"}

    for word in words:
        if word.get("type") != "word":
            continue

        # Start new segment if gap > 1.5s
        if current_words:
            gap = word["start"] - current_words[-1]["end"]
            if gap > 1.5:
                segments.append(_finalize_segment(current_words, len(segments)))
                current_words = []

        current_words.append(word)

        # Split on sentence-ending punctuation
        text = word.get("text", "")
        if text and text[-1] in sentence_enders:
            segments.append(_finalize_segment(current_words, len(segments)))
            current_words = []

    if current_words:
        segments.append(_finalize_segment(current_words, len(segments)))

    return segments


def _finalize_segment(words: list[dict], index: int) -> dict:
    text = "".join(w["text"] for w in words)
    return {
        "id": f"seg_{index:03d}",
        "start": words[0]["start"],
        "end": words[-1]["end"],
        "text": text,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_transcription.py -v` Expected:
All 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/transcription.py backend/tests/test_transcription.py
git commit -m "feat: add ElevenLabs Scribe transcription service"
```

---

### Task 7: Pinyin Generation Service

**Files:**

- Create: `backend/app/services/pinyin.py`
- Create: `backend/tests/test_pinyin.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_pinyin.py`:

```python
from app.services.pinyin import generate_pinyin


def test_generate_pinyin_basic():
    result = generate_pinyin("你好世界")
    assert "nǐ" in result.lower()
    assert "hǎo" in result.lower()


def test_generate_pinyin_sentence():
    result = generate_pinyin("今天是星期四")
    assert "jīntiān" in result.lower() or "jīn" in result.lower()


def test_generate_pinyin_empty():
    result = generate_pinyin("")
    assert result == ""


def test_generate_pinyin_with_punctuation():
    result = generate_pinyin("你好！")
    assert "！" in result or "!" in result
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_pinyin.py -v` Expected: FAIL
with `ImportError`

- [ ] **Step 3: Implement pinyin service**

Create `backend/app/services/pinyin.py`:

```python
from pypinyin import pinyin, Style


def generate_pinyin(chinese_text: str) -> str:
    """Generate pinyin with tone marks for Chinese text.

    Non-Chinese characters (punctuation, numbers) are preserved as-is.
    """
    if not chinese_text:
        return ""

    result = pinyin(chinese_text, style=Style.TONE, heteronym=False)
    return " ".join(item[0] for item in result)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_pinyin.py -v` Expected: All 4
tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/pinyin.py backend/tests/test_pinyin.py
git commit -m "feat: add pypinyin-based pinyin generation service"
```

---

### Task 8: Translation Service (OpenRouter)

**Files:**

- Create: `backend/app/services/translation.py`
- Create: `backend/tests/test_translation.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_translation.py`:

```python
import pytest
import json
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.translation import translate_segments, _build_translation_prompt


def test_build_translation_prompt():
    segments = [
        {"id": "seg_000", "text": "你好世界"},
        {"id": "seg_001", "text": "今天天气很好"},
    ]
    prompt = _build_translation_prompt(segments, ["en"])
    assert "你好世界" in prompt
    assert "今天天气很好" in prompt
    assert "en" in prompt


@pytest.mark.asyncio
async def test_translate_segments_parses_response():
    llm_response = {
        "seg_000": {
            "translations": {"en": "Hello world"},
            "words": [
                {"word": "你好", "pinyin": "nǐhǎo", "meaning": "hello", "usage": "Common greeting"}
            ],
        },
        "seg_001": {
            "translations": {"en": "The weather is nice today"},
            "words": [
                {"word": "今天", "pinyin": "jīntiān", "meaning": "today", "usage": "Current day"}
            ],
        },
    }

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "choices": [{"message": {"content": json.dumps(llm_response)}}]
    }

    with patch("app.services.translation.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post.return_value = mock_response
        mock_client_cls.return_value = mock_client

        segments = [
            {"id": "seg_000", "text": "你好世界"},
            {"id": "seg_001", "text": "今天天气很好"},
        ]

        result = await translate_segments(
            segments, ["en"], "fake-key", "openai/gpt-4o-mini"
        )

        assert "seg_000" in result
        assert result["seg_000"]["translations"]["en"] == "Hello world"
        assert len(result["seg_000"]["words"]) > 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_translation.py -v` Expected:
FAIL with `ImportError`

- [ ] **Step 3: Implement translation service**

Create `backend/app/services/translation.py`:

````python
import json
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

def _build_translation_prompt(segments: list[dict], languages: list[str]) -> str:
    lang_list = ", ".join(languages)
    segment_lines = "\n".join(
        f'- id: "{s["id"]}", text: "{s["text"]}"' for s in segments
    )

    return f"""You are a Chinese language teaching assistant. For each segment below, provide:
1. Translations in these languages: {lang_list} (use ISO 639-1 codes as keys)
2. A word breakdown: each distinct word with pinyin, meaning, and a brief usage note

Segments:
{segment_lines}

Respond with ONLY valid JSON (no markdown fences). Format:
{{
  "<segment_id>": {{
    "translations": {{"<lang_code>": "<translation>", ...}},
    "words": [
      {{"word": "<chinese>", "pinyin": "<pinyin>", "meaning": "<meaning>", "usage": "<usage note>"}}
    ]
  }}
}}"""


async def translate_segments(
    segments: list[dict],
    languages: list[str],
    api_key: str,
    model: str,
) -> dict:
    """Translate segments in batches using OpenRouter.

    Returns a dict keyed by segment ID with translations and word breakdowns.
    """
    all_results: dict = {}
    batch_size = settings.translation_batch_size

    for i in range(0, len(segments), batch_size):
        batch = segments[i : i + batch_size]
        batch_result = await _translate_batch(batch, languages, api_key, model)
        all_results.update(batch_result)

    return all_results


async def _translate_batch(
    segments: list[dict],
    languages: list[str],
    api_key: str,
    model: str,
) -> dict:
    """Translate a single batch with retry logic."""
    prompt = _build_translation_prompt(segments, languages)

    for attempt in range(settings.translation_max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    settings.openrouter_chat_url,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.3,
                    },
                )

            if response.status_code != 200:
                raise RuntimeError(f"OpenRouter API error: {response.text}")

            content = response.json()["choices"][0]["message"]["content"]

            # Strip markdown code fences if present
            content = content.strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[1]
                content = content.rsplit("```", 1)[0]

            return json.loads(content)

        except (json.JSONDecodeError, KeyError, IndexError) as e:
            logger.warning(f"Translation batch attempt {attempt + 1} failed: {e}")
            if attempt == settings.translation_max_retries:
                # Return empty translations for failed segments
                return {
                    s["id"]: {
                        "translations": {lang: "[translation unavailable]" for lang in languages},
                        "words": [],
                        "_error": True,
                    }
                    for s in segments
                }

    return {}
````

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_translation.py -v` Expected: All
2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/translation.py backend/tests/test_translation.py
git commit -m "feat: add OpenRouter translation service with batching and retry"
```

---

### Task 9: Lesson Generation Router (SSE Streaming)

**Files:**

- Create: `backend/app/routers/lessons.py`
- Create: `backend/tests/test_lessons_router.py`

- [ ] **Step 1: Write failing test for the generate endpoint**

Create `backend/tests/test_lessons_router.py`:

```python
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.mark.asyncio
async def test_generate_lesson_rejects_missing_url():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/lessons/generate",
            json={
                "source": "youtube",
                "youtube_url": None,
                "translation_languages": ["en"],
                "openrouter_api_key": "key",
                "openrouter_model": "model",
                "elevenlabs_api_key": "key",
            },
        )
        assert response.status_code == 400


@pytest.mark.asyncio
async def test_generate_lesson_rejects_invalid_source():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/lessons/generate",
            json={
                "source": "invalid",
                "translation_languages": ["en"],
                "openrouter_api_key": "key",
                "openrouter_model": "model",
                "elevenlabs_api_key": "key",
            },
        )
        assert response.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_lessons_router.py -v` Expected:
FAIL (route doesn't exist yet)

- [ ] **Step 3: Implement the lesson generation router**

Create `backend/app/routers/lessons.py`:

```python
import json
import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.models import LessonRequest
from app.services.validation import validate_youtube_url, ValidationError
from app.services.audio import (
    extract_audio_from_youtube,
    extract_audio_from_upload,
    get_youtube_duration,
    probe_upload_duration,
)
from app.services.transcription import transcribe_audio
from app.services.pinyin import generate_pinyin
from app.services.translation import translate_segments
from app.config import settings

router = APIRouter(prefix="/api/lessons", tags=["lessons"])


@router.post("/generate")
async def generate_lesson(request: LessonRequest):
    """Generate a lesson from a YouTube URL. Returns SSE stream of progress events."""

    if request.source == "youtube":
        if not request.youtube_url:
            raise HTTPException(status_code=400, detail="YouTube URL is required")

        try:
            video_id = validate_youtube_url(request.youtube_url)
        except ValidationError as e:
            raise HTTPException(status_code=400, detail=e.message)

        return EventSourceResponse(_process_youtube_lesson(video_id, request))

    raise HTTPException(status_code=400, detail="Upload source requires file upload")


@router.post("/generate-upload")
async def generate_lesson_upload(
    file: UploadFile = File(...),
    translation_languages: str = Form(...),
    openrouter_api_key: str = Form(...),
    openrouter_model: str = Form(...),
    elevenlabs_api_key: str = Form(...),
):
    """Generate a lesson from an uploaded video file. Returns SSE stream."""
    from app.services.validation import validate_upload_file

    try:
        validate_upload_file(file.filename or "", file.size or 0)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=e.message)

    languages = json.loads(translation_languages)

    return EventSourceResponse(
        _process_upload_lesson(file, languages, openrouter_api_key, openrouter_model, elevenlabs_api_key)
    )


async def _process_youtube_lesson(video_id: str, request: LessonRequest):
    audio_path: Path | None = None
    try:
        # Step 1: Validate duration
        yield {"event": "step", "data": json.dumps({"step": "validation", "status": "active"})}
        duration = await get_youtube_duration(video_id)
        if duration > settings.max_video_duration_seconds:
            yield {"event": "error", "data": json.dumps({"message": "Video exceeds the 2-hour limit."})}
            return
        yield {"event": "step", "data": json.dumps({"step": "validation", "status": "done"})}

        # Step 2: Extract audio
        yield {"event": "step", "data": json.dumps({"step": "audio", "status": "active"})}
        audio_path = await extract_audio_from_youtube(video_id)
        yield {"event": "step", "data": json.dumps({"step": "audio", "status": "done"})}

        # Steps 3-5: shared pipeline
        async for event in _shared_pipeline(
            audio_path, request.elevenlabs_api_key, request.translation_languages,
            request.openrouter_api_key, request.openrouter_model,
            f"https://www.youtube.com/watch?v={video_id}", "youtube", duration,
        ):
            yield event

    except Exception as e:
        yield {"event": "error", "data": json.dumps({"message": str(e)})}
    finally:
        if audio_path and audio_path.exists():
            os.unlink(audio_path)


async def _process_upload_lesson(
    file: UploadFile, languages: list[str],
    openrouter_api_key: str, openrouter_model: str, elevenlabs_api_key: str,
):
    audio_path: Path | None = None
    upload_path: Path | None = None
    try:
        # Step 1: Save uploaded file to disk (streamed to avoid OOM on large files)
        yield {"event": "step", "data": json.dumps({"step": "validation", "status": "active"})}
        suffix = Path(file.filename or "video.mp4").suffix
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            upload_path = Path(tmp.name)
            while chunk := await file.read(1024 * 1024):  # 1 MB chunks
                tmp.write(chunk)

        # Validate duration via ffprobe
        duration = await probe_upload_duration(upload_path)
        if duration > settings.max_video_duration_seconds:
            yield {"event": "error", "data": json.dumps({"message": "Video exceeds the 2-hour limit."})}
            return
        yield {"event": "step", "data": json.dumps({"step": "validation", "status": "done"})}

        # Step 2: Extract audio
        yield {"event": "step", "data": json.dumps({"step": "audio", "status": "active"})}
        audio_path = await extract_audio_from_upload(upload_path)
        yield {"event": "step", "data": json.dumps({"step": "audio", "status": "done"})}

        # Steps 3-5: shared pipeline
        async for event in _shared_pipeline(
            audio_path, elevenlabs_api_key, languages,
            openrouter_api_key, openrouter_model,
            None, "upload", duration,
        ):
            yield event

    except Exception as e:
        yield {"event": "error", "data": json.dumps({"message": str(e)})}
    finally:
        if audio_path and audio_path.exists():
            os.unlink(audio_path)
        if upload_path and upload_path.exists():
            os.unlink(upload_path)


async def _shared_pipeline(
    audio_path: Path, elevenlabs_key: str, languages: list[str],
    openrouter_key: str, openrouter_model: str,
    source_url: str | None, source: str, duration: float,
):
    # Step 3: Transcribe
    yield {"event": "step", "data": json.dumps({"step": "transcription", "status": "active"})}
    raw_segments = await transcribe_audio(audio_path, elevenlabs_key)
    yield {"event": "step", "data": json.dumps({"step": "transcription", "status": "done"})}

    # Step 4: Pinyin
    yield {"event": "step", "data": json.dumps({"step": "pinyin", "status": "active"})}
    for seg in raw_segments:
        seg["pinyin"] = generate_pinyin(seg["text"])
    yield {"event": "step", "data": json.dumps({"step": "pinyin", "status": "done"})}

    # Step 5: Translation
    yield {"event": "step", "data": json.dumps({"step": "translation", "status": "active"})}
    translations = await translate_segments(
        raw_segments, languages, openrouter_key, openrouter_model
    )
    yield {"event": "step", "data": json.dumps({"step": "translation", "status": "done"})}

    # Assemble lesson
    segments = []
    for seg in raw_segments:
        t = translations.get(seg["id"], {})
        segments.append({
            "id": seg["id"],
            "start": seg["start"],
            "end": seg["end"],
            "chinese": seg["text"],
            "pinyin": seg["pinyin"],
            "translations": t.get("translations", {}),
            "words": t.get("words", []),
        })

    # Derive title from first segment
    title = raw_segments[0]["text"][:30] if raw_segments else "Untitled Lesson"
    if duration == 0 and raw_segments:
        duration = raw_segments[-1]["end"]

    lesson = {
        "title": title,
        "source": source,
        "source_url": source_url,
        "duration": duration,
        "segments": segments,
        "translation_languages": languages,
    }

    yield {"event": "complete", "data": json.dumps(lesson)}
```

- [ ] **Step 4: Mount the router in main.py**

Add to `backend/app/main.py`:

```python
from app.routers import lessons

app.include_router(lessons.router)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_lessons_router.py -v` Expected:
All 2 tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/lessons.py backend/app/main.py backend/tests/test_lessons_router.py
git commit -m "feat: add lesson generation endpoint with SSE streaming progress"
```

---

### Task 10: Chat Router (Streaming)

**Files:**

- Create: `backend/app/routers/chat.py`
- Create: `backend/tests/test_chat_router.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_chat_router.py`:

```python
import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.mark.asyncio
async def test_chat_rejects_empty_messages():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/chat",
            json={
                "messages": [],
                "video_title": "Test",
                "active_segment": None,
                "context_segments": [],
                "openrouter_api_key": "key",
                "openrouter_model": "model",
            },
        )
        assert response.status_code == 400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_chat_router.py -v` Expected:
FAIL (route doesn't exist)

- [ ] **Step 3: Implement chat router**

Create `backend/app/routers/chat.py`:

```python
import json

import httpx
from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.models import ChatRequest
from app.config import settings

router = APIRouter(prefix="/api", tags=["chat"])


def _build_system_prompt(request: ChatRequest) -> str:
    context = f"Video: {request.video_title}\n"

    if request.active_segment:
        seg = request.active_segment
        context += (
            f"Current segment [{seg.start:.1f}s - {seg.end:.1f}s]: "
            f"{seg.chinese} ({seg.pinyin})\n"
        )

    if request.context_segments:
        context += "\nNearby transcript:\n"
        for seg in request.context_segments[:40]:
            context += f"  [{seg.start:.1f}s] {seg.chinese}\n"

    return f"""You are a Mandarin Chinese language tutor helping a student who is learning by shadowing a video.

{context}

Guidelines:
- Explain grammar patterns clearly with examples
- Format grammar responses as: pattern → example sentence (Chinese + pinyin + translation)
- Answer vocabulary questions with word, pinyin, meaning, and usage examples
- Keep answers focused and practical for a language learner
- You can reference the current video segment and transcript context
- Respond in the same language the student uses for their questions"""


@router.post("/chat")
async def chat(request: ChatRequest):
    if not request.messages:
        raise HTTPException(status_code=400, detail="Messages cannot be empty")

    system_prompt = _build_system_prompt(request)

    messages = [
        {"role": "system", "content": system_prompt},
        *[{"role": m.role, "content": m.content} for m in request.messages[-20:]],
    ]

    return EventSourceResponse(
        _stream_chat(messages, request.openrouter_api_key, request.openrouter_model)
    )


async def _stream_chat(messages: list[dict], api_key: str, model: str):
    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            settings.openrouter_chat_url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "stream": True,
            },
        ) as response:
            if response.status_code != 200:
                error_text = ""
                async for chunk in response.aiter_text():
                    error_text += chunk
                yield {
                    "event": "error",
                    "data": json.dumps({"message": f"Chat failed: {error_text}"}),
                }
                return

            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    if data == "[DONE]":
                        yield {"event": "done", "data": "{}"}
                        return
                    try:
                        parsed = json.loads(data)
                        delta = parsed["choices"][0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield {
                                "event": "token",
                                "data": json.dumps({"content": content}),
                            }
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
```

- [ ] **Step 4: Mount chat router in main.py**

Add to `backend/app/main.py`:

```python
from app.routers import chat

app.include_router(chat.router)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_chat_router.py -v` Expected: All
1 test PASS

- [ ] **Step 6: Run all backend tests**

Run: `cd backend && python -m pytest -v` Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/chat.py backend/app/main.py backend/tests/test_chat_router.py
git commit -m "feat: add streaming chat endpoint for AI companion"
```

---

## Chunk 3: Frontend Foundation (Storage, Crypto, Routing)

### Task 11: IndexedDB Storage Layer

**Files:**

- Create: `frontend/src/db/index.ts`
- Create: `frontend/tests/db.test.ts`

- [ ] **Step 1: Write failing tests for the DB layer**

Create `frontend/tests/db.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

// We'll use fake-indexeddb for testing
import 'fake-indexeddb/auto';

import {
	initDB,
	saveLessonMeta,
	getLessonMeta,
	getAllLessonMetas,
	deleteLessonMeta,
	saveSegments,
	getSegments,
	saveSettings,
	getSettings,
	saveChatMessages,
	getChatMessages,
	saveCryptoData,
	getCryptoData,
	deleteFullLesson,
} from '../src/db';

describe('IndexedDB storage', () => {
	beforeEach(async () => {
		// Reset the database before each test
		const dbs = await indexedDB.databases();
		for (const db of dbs) {
			if (db.name) indexedDB.deleteDatabase(db.name);
		}
	});

	it('should save and retrieve lesson metadata', async () => {
		const db = await initDB();
		const meta = {
			id: 'lesson_1',
			title: 'Test Lesson',
			source: 'youtube' as const,
			sourceUrl: 'https://youtube.com/watch?v=123',
			duration: 120,
			segmentCount: 5,
			translationLanguages: ['en'],
			createdAt: new Date().toISOString(),
			lastOpenedAt: new Date().toISOString(),
			progressSegmentId: null,
			tags: [],
		};
		await saveLessonMeta(db, meta);
		const retrieved = await getLessonMeta(db, 'lesson_1');
		expect(retrieved).toEqual(meta);
	});

	it('should list all lesson metadata', async () => {
		const db = await initDB();
		await saveLessonMeta(db, {
			id: 'lesson_1',
			title: 'A',
			source: 'youtube',
			sourceUrl: null,
			duration: 60,
			segmentCount: 2,
			translationLanguages: ['en'],
			createdAt: new Date().toISOString(),
			lastOpenedAt: new Date().toISOString(),
			progressSegmentId: null,
			tags: [],
		});
		await saveLessonMeta(db, {
			id: 'lesson_2',
			title: 'B',
			source: 'upload',
			sourceUrl: null,
			duration: 90,
			segmentCount: 3,
			translationLanguages: ['en'],
			createdAt: new Date().toISOString(),
			lastOpenedAt: new Date().toISOString(),
			progressSegmentId: null,
			tags: [],
		});
		const all = await getAllLessonMetas(db);
		expect(all).toHaveLength(2);
	});

	it('should delete a lesson', async () => {
		const db = await initDB();
		await saveLessonMeta(db, {
			id: 'lesson_1',
			title: 'A',
			source: 'youtube',
			sourceUrl: null,
			duration: 60,
			segmentCount: 2,
			translationLanguages: ['en'],
			createdAt: new Date().toISOString(),
			lastOpenedAt: new Date().toISOString(),
			progressSegmentId: null,
			tags: [],
		});
		await deleteLessonMeta(db, 'lesson_1');
		const retrieved = await getLessonMeta(db, 'lesson_1');
		expect(retrieved).toBeUndefined();
	});

	it('should save and retrieve segments', async () => {
		const db = await initDB();
		const segments = [
			{
				id: 'seg_000',
				start: 0,
				end: 1,
				chinese: '你好',
				pinyin: 'nǐ hǎo',
				translations: { en: 'Hello' },
				words: [],
			},
		];
		await saveSegments(db, 'lesson_1', segments);
		const retrieved = await getSegments(db, 'lesson_1');
		expect(retrieved).toEqual(segments);
	});

	it('should save and retrieve settings', async () => {
		const db = await initDB();
		const s = { translationLanguage: 'en', defaultModel: 'openai/gpt-4o-mini' };
		await saveSettings(db, s);
		const retrieved = await getSettings(db);
		expect(retrieved).toEqual(s);
	});

	it('should save and retrieve chat messages', async () => {
		const db = await initDB();
		const msgs = [
			{
				role: 'user' as const,
				content: 'Hello',
				timestamp: new Date().toISOString(),
			},
			{
				role: 'assistant' as const,
				content: 'Hi!',
				timestamp: new Date().toISOString(),
			},
		];
		await saveChatMessages(db, 'lesson_1', msgs);
		const retrieved = await getChatMessages(db, 'lesson_1');
		expect(retrieved).toEqual(msgs);
	});

	it('should save and retrieve crypto data', async () => {
		const db = await initDB();
		const data = {
			encrypted: new ArrayBuffer(16),
			salt: new Uint8Array(16),
			iv: new Uint8Array(12),
		};
		await saveCryptoData(db, data);
		const retrieved = await getCryptoData(db);
		expect(retrieved).toBeDefined();
		expect(retrieved!.salt).toEqual(data.salt);
	});

	it('should delete full lesson across all stores', async () => {
		const db = await initDB();
		await saveLessonMeta(db, {
			id: 'lesson_del',
			title: 'Delete Me',
			source: 'youtube',
			sourceUrl: null,
			duration: 60,
			segmentCount: 1,
			translationLanguages: ['en'],
			createdAt: new Date().toISOString(),
			lastOpenedAt: new Date().toISOString(),
			progressSegmentId: null,
			tags: [],
		});
		await saveSegments(db, 'lesson_del', []);
		await deleteFullLesson(db, 'lesson_del');
		expect(await getLessonMeta(db, 'lesson_del')).toBeUndefined();
		expect(await getSegments(db, 'lesson_del')).toBeUndefined();
	});
});
```

- [ ] **Step 2: Install fake-indexeddb for testing**

```bash
cd frontend && npm install -D fake-indexeddb
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npx vitest run tests/db.test.ts` Expected: FAIL with module
not found

- [ ] **Step 4: Implement the IndexedDB storage layer**

Create `frontend/src/db/index.ts`:

```typescript
import { openDB, IDBPDatabase } from 'idb';
import type { LessonMeta, Segment, AppSettings, ChatMessage } from '../types';

const DB_NAME = 'shadowlearn';
const DB_VERSION = 1;

export type ShadowLearnDB = IDBPDatabase;

export async function initDB(): Promise<ShadowLearnDB> {
	return openDB(DB_NAME, DB_VERSION, {
		upgrade(db) {
			if (!db.objectStoreNames.contains('lessons')) {
				db.createObjectStore('lessons', { keyPath: 'id' });
			}
			if (!db.objectStoreNames.contains('segments')) {
				db.createObjectStore('segments');
			}
			if (!db.objectStoreNames.contains('videos')) {
				db.createObjectStore('videos');
			}
			if (!db.objectStoreNames.contains('chats')) {
				db.createObjectStore('chats');
			}
			if (!db.objectStoreNames.contains('settings')) {
				db.createObjectStore('settings');
			}
			if (!db.objectStoreNames.contains('crypto')) {
				db.createObjectStore('crypto');
			}
		},
	});
}

// Lesson metadata
export async function saveLessonMeta(
	db: ShadowLearnDB,
	meta: LessonMeta,
): Promise<void> {
	await db.put('lessons', meta);
}

export async function getLessonMeta(
	db: ShadowLearnDB,
	id: string,
): Promise<LessonMeta | undefined> {
	return db.get('lessons', id);
}

export async function getAllLessonMetas(
	db: ShadowLearnDB,
): Promise<LessonMeta[]> {
	return db.getAll('lessons');
}

export async function deleteLessonMeta(
	db: ShadowLearnDB,
	id: string,
): Promise<void> {
	await db.delete('lessons', id);
}

// Segments
export async function saveSegments(
	db: ShadowLearnDB,
	lessonId: string,
	segments: Segment[],
): Promise<void> {
	await db.put('segments', segments, lessonId);
}

export async function getSegments(
	db: ShadowLearnDB,
	lessonId: string,
): Promise<Segment[] | undefined> {
	return db.get('segments', lessonId);
}

export async function deleteSegments(
	db: ShadowLearnDB,
	lessonId: string,
): Promise<void> {
	await db.delete('segments', lessonId);
}

// Videos (uploaded file blobs)
export async function saveVideo(
	db: ShadowLearnDB,
	lessonId: string,
	blob: Blob,
): Promise<void> {
	await db.put('videos', blob, lessonId);
}

export async function getVideo(
	db: ShadowLearnDB,
	lessonId: string,
): Promise<Blob | undefined> {
	return db.get('videos', lessonId);
}

export async function deleteVideo(
	db: ShadowLearnDB,
	lessonId: string,
): Promise<void> {
	await db.delete('videos', lessonId);
}

// Chat history
export async function saveChatMessages(
	db: ShadowLearnDB,
	lessonId: string,
	messages: ChatMessage[],
): Promise<void> {
	await db.put('chats', messages, lessonId);
}

export async function getChatMessages(
	db: ShadowLearnDB,
	lessonId: string,
): Promise<ChatMessage[] | undefined> {
	return db.get('chats', lessonId);
}

export async function deleteChatMessages(
	db: ShadowLearnDB,
	lessonId: string,
): Promise<void> {
	await db.delete('chats', lessonId);
}

// Settings
export async function saveSettings(
	db: ShadowLearnDB,
	settings: AppSettings,
): Promise<void> {
	await db.put('settings', settings, 'settings');
}

export async function getSettings(
	db: ShadowLearnDB,
): Promise<AppSettings | undefined> {
	return db.get('settings', 'settings');
}

// Crypto store
export async function saveCryptoData(
	db: ShadowLearnDB,
	data: { encrypted: ArrayBuffer; salt: Uint8Array; iv: Uint8Array },
): Promise<void> {
	await db.put('crypto', data, 'keys');
}

export async function getCryptoData(
	db: ShadowLearnDB,
): Promise<
	{ encrypted: ArrayBuffer; salt: Uint8Array; iv: Uint8Array } | undefined
> {
	return db.get('crypto', 'keys');
}

export async function deleteCryptoData(db: ShadowLearnDB): Promise<void> {
	await db.delete('crypto', 'keys');
}

// Full lesson delete (all stores)
export async function deleteFullLesson(
	db: ShadowLearnDB,
	lessonId: string,
): Promise<void> {
	await Promise.all([
		deleteLessonMeta(db, lessonId),
		deleteSegments(db, lessonId),
		deleteVideo(db, lessonId),
		deleteChatMessages(db, lessonId),
	]);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run tests/db.test.ts` Expected: All 8 tests PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/db/ frontend/tests/db.test.ts frontend/package.json frontend/package-lock.json
git commit -m "feat: add IndexedDB storage layer for lessons, segments, settings, crypto"
```

---

### Task 12: Web Crypto Encryption Module

**Files:**

- Create: `frontend/src/crypto/index.ts`
- Create: `frontend/tests/crypto.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/tests/crypto.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { encryptKeys, decryptKeys } from '../src/crypto';
import type { DecryptedKeys } from '../src/types';

describe('Crypto module', () => {
	const testKeys: DecryptedKeys = {
		elevenlabsApiKey: 'el-test-key-12345',
		openrouterApiKey: 'or-test-key-67890',
	};
	const pin = '1234';

	it('should encrypt and decrypt keys round-trip', async () => {
		const encrypted = await encryptKeys(testKeys, pin);
		expect(encrypted.encrypted).toBeInstanceOf(ArrayBuffer);
		expect(encrypted.salt).toBeInstanceOf(Uint8Array);
		expect(encrypted.iv).toBeInstanceOf(Uint8Array);

		const decrypted = await decryptKeys(encrypted, pin);
		expect(decrypted).toEqual(testKeys);
	});

	it('should fail to decrypt with wrong PIN', async () => {
		const encrypted = await encryptKeys(testKeys, pin);
		await expect(decryptKeys(encrypted, 'wrong')).rejects.toThrow();
	});

	it('should produce different ciphertext for same input (random salt/IV)', async () => {
		const e1 = await encryptKeys(testKeys, pin);
		const e2 = await encryptKeys(testKeys, pin);
		const b1 = new Uint8Array(e1.encrypted);
		const b2 = new Uint8Array(e2.encrypted);
		// Very unlikely to be equal with random salt+IV
		expect(b1).not.toEqual(b2);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run tests/crypto.test.ts` Expected: FAIL with
module not found

- [ ] **Step 3: Implement the crypto module**

Create `frontend/src/crypto/index.ts`:

```typescript
import type { DecryptedKeys } from '../types';

export interface EncryptedData {
	encrypted: ArrayBuffer;
	salt: Uint8Array;
	iv: Uint8Array;
}

const PBKDF2_ITERATIONS = 100_000;

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
	const encoder = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		encoder.encode(pin),
		'PBKDF2',
		false,
		['deriveKey'],
	);

	return crypto.subtle.deriveKey(
		{
			name: 'PBKDF2',
			salt,
			iterations: PBKDF2_ITERATIONS,
			hash: 'SHA-256',
		},
		keyMaterial,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt'],
	);
}

export async function encryptKeys(
	keys: DecryptedKeys,
	pin: string,
): Promise<EncryptedData> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const key = await deriveKey(pin, salt);

	const encoder = new TextEncoder();
	const plaintext = encoder.encode(JSON.stringify(keys));

	const encrypted = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		plaintext,
	);

	return { encrypted, salt, iv };
}

export async function decryptKeys(
	data: EncryptedData,
	pin: string,
): Promise<DecryptedKeys> {
	const key = await deriveKey(pin, data.salt);

	const decrypted = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: data.iv },
		key,
		data.encrypted,
	);

	const decoder = new TextDecoder();
	return JSON.parse(decoder.decode(decrypted));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run tests/crypto.test.ts` Expected: All 3 tests
PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/crypto/ frontend/tests/crypto.test.ts
git commit -m "feat: add Web Crypto encryption module for API key storage"
```

---

### Task 13: Auth Context (PIN Unlock + Key Management)

**Files:**

- Create: `frontend/src/contexts/AuthContext.tsx`

- [ ] **Step 1: Implement AuthContext**

Create `frontend/src/contexts/AuthContext.tsx`:

```typescript
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { DecryptedKeys } from "../types";
import { encryptKeys, decryptKeys } from "../crypto";
import {
  initDB,
  saveCryptoData,
  getCryptoData,
  deleteCryptoData,
  type ShadowLearnDB,
} from "../db";

interface AuthState {
  isFirstSetup: boolean | null; // null = loading
  isUnlocked: boolean;
  keys: DecryptedKeys | null;
  db: ShadowLearnDB | null;
  unlock: (pin: string) => Promise<void>;
  setup: (keys: DecryptedKeys, pin: string) => Promise<void>;
  resetKeys: () => Promise<void>;
  lock: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<ShadowLearnDB | null>(null);
  const [isFirstSetup, setIsFirstSetup] = useState<boolean | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [keys, setKeys] = useState<DecryptedKeys | null>(null);

  useEffect(() => {
    initDB().then(async (database) => {
      setDb(database);
      const cryptoData = await getCryptoData(database);
      setIsFirstSetup(!cryptoData);
    });
  }, []);

  const setup = useCallback(
    async (newKeys: DecryptedKeys, pin: string) => {
      if (!db) throw new Error("Database not initialized");
      const encrypted = await encryptKeys(newKeys, pin);
      await saveCryptoData(db, encrypted);
      setKeys(newKeys);
      setIsUnlocked(true);
      setIsFirstSetup(false);
    },
    [db]
  );

  const unlock = useCallback(
    async (pin: string) => {
      if (!db) throw new Error("Database not initialized");
      const cryptoData = await getCryptoData(db);
      if (!cryptoData) throw new Error("No encrypted keys found");
      const decrypted = await decryptKeys(cryptoData, pin);
      setKeys(decrypted);
      setIsUnlocked(true);
    },
    [db]
  );

  const lock = useCallback(() => {
    setKeys(null);
    setIsUnlocked(false);
  }, []);

  const resetKeys = useCallback(async () => {
    if (!db) throw new Error("Database not initialized");
    await deleteCryptoData(db);
    setKeys(null);
    setIsUnlocked(false);
    setIsFirstSetup(true);
  }, [db]);

  return (
    <AuthContext.Provider
      value={{ isFirstSetup, isUnlocked, keys, db, unlock, setup, resetKeys, lock }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

- [ ] **Step 2: Wire AuthProvider into App.tsx**

Update `frontend/src/App.tsx` to wrap routes in `<AuthProvider>`:

```typescript
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";

function Placeholder({ name }: { name: string }) {
  return <div className="p-8 text-white">{name} — coming soon</div>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Placeholder name="Library" />} />
          <Route path="/create" element={<Placeholder name="Create Lesson" />} />
          <Route path="/lesson/:id" element={<Placeholder name="Lesson View" />} />
          <Route path="/settings" element={<Placeholder name="Settings" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/contexts/AuthContext.tsx frontend/src/App.tsx
git commit -m "feat: add AuthContext for PIN-based key management"
```

---

### Task 14: VideoPlayer Abstraction

**Files:**

- Create: `frontend/src/player/types.ts`
- Create: `frontend/src/player/HTML5Player.ts`
- Create: `frontend/src/player/YouTubePlayer.ts`
- Create: `frontend/src/contexts/PlayerContext.tsx`

- [ ] **Step 1: Create the VideoPlayer interface**

Create `frontend/src/player/types.ts`:

```typescript
export interface VideoPlayer {
	play(): void;
	pause(): void;
	seekTo(seconds: number): void;
	getCurrentTime(): number;
	getDuration(): number;
	setPlaybackRate(rate: number): void;
	onTimeUpdate(callback: (currentTime: number) => void): () => void;
	onEnded(callback: () => void): () => void;
	destroy(): void;
}
```

- [ ] **Step 2: Implement HTML5Player**

Create `frontend/src/player/HTML5Player.ts`:

```typescript
import type { VideoPlayer } from './types';

export class HTML5Player implements VideoPlayer {
	private element: HTMLVideoElement;
	private timeUpdateCallbacks: Array<(time: number) => void> = [];
	private endedCallbacks: Array<() => void> = [];
	private rafId: number | null = null;

	constructor(element: HTMLVideoElement) {
		this.element = element;
		this.element.addEventListener('ended', this.handleEnded);
		this.startTimeUpdateLoop();
	}

	play(): void {
		this.element.play();
	}

	pause(): void {
		this.element.pause();
	}

	seekTo(seconds: number): void {
		this.element.currentTime = seconds;
	}

	getCurrentTime(): number {
		return this.element.currentTime;
	}

	getDuration(): number {
		return this.element.duration || 0;
	}

	setPlaybackRate(rate: number): void {
		this.element.playbackRate = rate;
	}

	onTimeUpdate(callback: (currentTime: number) => void): () => void {
		this.timeUpdateCallbacks.push(callback);
		return () => {
			this.timeUpdateCallbacks = this.timeUpdateCallbacks.filter(
				(cb) => cb !== callback,
			);
		};
	}

	onEnded(callback: () => void): () => void {
		this.endedCallbacks.push(callback);
		return () => {
			this.endedCallbacks = this.endedCallbacks.filter((cb) => cb !== callback);
		};
	}

	destroy(): void {
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
		}
		this.element.removeEventListener('ended', this.handleEnded);
		this.timeUpdateCallbacks = [];
		this.endedCallbacks = [];
	}

	private startTimeUpdateLoop(): void {
		const tick = () => {
			const time = this.element.currentTime;
			for (const cb of this.timeUpdateCallbacks) {
				cb(time);
			}
			this.rafId = requestAnimationFrame(tick);
		};
		this.rafId = requestAnimationFrame(tick);
	}

	private handleEnded = (): void => {
		for (const cb of this.endedCallbacks) {
			cb();
		}
	};
}
```

- [ ] **Step 3: Implement YouTubePlayer**

Create `frontend/src/player/YouTubePlayer.ts`:

```typescript
import type { VideoPlayer } from './types';

declare global {
	interface Window {
		YT: typeof YT;
		onYouTubeIframeAPIReady: () => void;
	}
}

let apiLoaded = false;
let apiLoadPromise: Promise<void> | null = null;

function loadYouTubeAPI(): Promise<void> {
	if (apiLoaded) return Promise.resolve();
	if (apiLoadPromise) return apiLoadPromise;

	apiLoadPromise = new Promise<void>((resolve) => {
		const script = document.createElement('script');
		script.src = 'https://www.youtube.com/iframe_api';
		window.onYouTubeIframeAPIReady = () => {
			apiLoaded = true;
			resolve();
		};
		document.head.appendChild(script);
	});

	return apiLoadPromise;
}

export class YouTubePlayer implements VideoPlayer {
	private player: YT.Player | null = null;
	private timeUpdateCallbacks: Array<(time: number) => void> = [];
	private endedCallbacks: Array<() => void> = [];
	private intervalId: ReturnType<typeof setInterval> | null = null;
	private ready: Promise<void>;

	constructor(containerId: string, videoId: string) {
		this.ready = this.init(containerId, videoId);
	}

	private async init(containerId: string, videoId: string): Promise<void> {
		await loadYouTubeAPI();

		return new Promise<void>((resolve) => {
			this.player = new window.YT.Player(containerId, {
				videoId,
				playerVars: {
					autoplay: 0,
					controls: 0,
					modestbranding: 1,
					rel: 0,
				},
				events: {
					onReady: () => {
						this.startTimeUpdateLoop();
						resolve();
					},
					onStateChange: (event: YT.OnStateChangeEvent) => {
						if (event.data === window.YT.PlayerState.ENDED) {
							for (const cb of this.endedCallbacks) cb();
						}
					},
				},
			});
		});
	}

	play(): void {
		this.player?.playVideo();
	}

	pause(): void {
		this.player?.pauseVideo();
	}

	seekTo(seconds: number): void {
		this.player?.seekTo(seconds, true);
	}

	getCurrentTime(): number {
		return this.player?.getCurrentTime() ?? 0;
	}

	getDuration(): number {
		return this.player?.getDuration() ?? 0;
	}

	setPlaybackRate(rate: number): void {
		this.player?.setPlaybackRate(rate);
	}

	onTimeUpdate(callback: (currentTime: number) => void): () => void {
		this.timeUpdateCallbacks.push(callback);
		return () => {
			this.timeUpdateCallbacks = this.timeUpdateCallbacks.filter(
				(cb) => cb !== callback,
			);
		};
	}

	onEnded(callback: () => void): () => void {
		this.endedCallbacks.push(callback);
		return () => {
			this.endedCallbacks = this.endedCallbacks.filter((cb) => cb !== callback);
		};
	}

	destroy(): void {
		if (this.intervalId !== null) {
			clearInterval(this.intervalId);
		}
		this.player?.destroy();
		this.timeUpdateCallbacks = [];
		this.endedCallbacks = [];
	}

	private startTimeUpdateLoop(): void {
		this.intervalId = setInterval(() => {
			const time = this.getCurrentTime();
			for (const cb of this.timeUpdateCallbacks) {
				cb(time);
			}
		}, 100);
	}
}
```

- [ ] **Step 4: Create PlayerContext**

Create `frontend/src/contexts/PlayerContext.tsx`:

```typescript
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { VideoPlayer } from "../player/types";

interface PlayerState {
  player: VideoPlayer | null;
  currentTime: number;
  playbackRate: number;
  setPlayer: (player: VideoPlayer) => void;
  setPlaybackRate: (rate: number) => void;
}

const PlayerContext = createContext<PlayerState | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [player, setPlayerState] = useState<VideoPlayer | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const unsubRef = useRef<(() => void) | null>(null);

  const setPlayer = useCallback((newPlayer: VideoPlayer) => {
    if (unsubRef.current) {
      unsubRef.current();
    }

    const unsub = newPlayer.onTimeUpdate((time) => {
      setCurrentTime(time);
    });
    unsubRef.current = unsub;
    setPlayerState(newPlayer);
  }, []);

  const setPlaybackRate = useCallback(
    (rate: number) => {
      player?.setPlaybackRate(rate);
      setPlaybackRateState(rate);
    },
    [player]
  );

  return (
    <PlayerContext.Provider
      value={{ player, currentTime, playbackRate, setPlayer, setPlaybackRate }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerState {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/player/ frontend/src/contexts/PlayerContext.tsx
git commit -m "feat: add VideoPlayer abstraction (YouTube + HTML5) and PlayerContext"
```

---

### Task 15: Custom Hooks (useLesson, useActiveSegment, useChat)

**Files:**

- Create: `frontend/src/hooks/useLesson.ts`
- Create: `frontend/src/hooks/useActiveSegment.ts`
- Create: `frontend/src/hooks/useChat.ts`
- Create: `frontend/tests/useActiveSegment.test.ts`

- [ ] **Step 0: Write failing test for useActiveSegment**

Create `frontend/tests/useActiveSegment.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useActiveSegment } from '../src/hooks/useActiveSegment';
import type { Segment } from '../src/types';

const segments: Segment[] = [
	{
		id: 'seg_000',
		start: 0,
		end: 2,
		chinese: 'A',
		pinyin: 'a',
		translations: {},
		words: [],
	},
	{
		id: 'seg_001',
		start: 3,
		end: 5,
		chinese: 'B',
		pinyin: 'b',
		translations: {},
		words: [],
	},
	{
		id: 'seg_002',
		start: 6,
		end: 8,
		chinese: 'C',
		pinyin: 'c',
		translations: {},
		words: [],
	},
];

describe('useActiveSegment', () => {
	it('returns segment when time is within range', () => {
		const { result } = renderHook(() => useActiveSegment(segments, 3.5));
		expect(result.current?.id).toBe('seg_001');
	});

	it('returns last past segment when in a gap', () => {
		const { result } = renderHook(() => useActiveSegment(segments, 2.5));
		expect(result.current?.id).toBe('seg_000');
	});

	it('returns null when before all segments', () => {
		const { result } = renderHook(() => useActiveSegment([], 0));
		expect(result.current).toBeNull();
	});
});
```

Run: `cd frontend && npx vitest run tests/useActiveSegment.test.ts` Expected:
FAIL with module not found

- [ ] **Step 1: Implement useLesson hook**

Create `frontend/src/hooks/useLesson.ts`:

```typescript
import { useState, useEffect } from 'react';
import type { LessonMeta, Segment } from '../types';
import {
	getLessonMeta,
	getSegments,
	saveLessonMeta,
	type ShadowLearnDB,
} from '../db';

interface UseLessonResult {
	meta: LessonMeta | null;
	segments: Segment[];
	loading: boolean;
	error: string | null;
}

export function useLesson(
	db: ShadowLearnDB | null,
	lessonId: string | undefined,
): UseLessonResult {
	const [meta, setMeta] = useState<LessonMeta | null>(null);
	const [segments, setSegments] = useState<Segment[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!db || !lessonId) return;

		async function load() {
			try {
				setLoading(true);
				const [m, s] = await Promise.all([
					getLessonMeta(db!, lessonId!),
					getSegments(db!, lessonId!),
				]);
				if (!m) {
					setError('Lesson not found');
					return;
				}
				// Update lastOpenedAt
				m.lastOpenedAt = new Date().toISOString();
				await saveLessonMeta(db!, m);
				setMeta(m);
				setSegments(s || []);
			} catch (e) {
				setError(e instanceof Error ? e.message : 'Failed to load lesson');
			} finally {
				setLoading(false);
			}
		}

		load();
	}, [db, lessonId]);

	return { meta, segments, loading, error };
}
```

- [ ] **Step 2: Implement useActiveSegment hook**

Create `frontend/src/hooks/useActiveSegment.ts`:

```typescript
import { useMemo } from 'react';
import type { Segment } from '../types';

export function useActiveSegment(
	segments: Segment[],
	currentTime: number,
): Segment | null {
	return useMemo(() => {
		// Find the segment where start <= currentTime < end
		for (const seg of segments) {
			if (currentTime >= seg.start && currentTime < seg.end) {
				return seg;
			}
		}
		// If in a gap, return the most recent past segment
		let lastBefore: Segment | null = null;
		for (const seg of segments) {
			if (seg.end <= currentTime) {
				lastBefore = seg;
			}
		}
		return lastBefore;
	}, [segments, currentTime]);
}
```

- [ ] **Step 3: Implement useChat hook**

Create `frontend/src/hooks/useChat.ts`:

```typescript
import { useState, useCallback, useEffect, useRef } from 'react';
import type { ChatMessage, Segment, DecryptedKeys } from '../types';
import { getChatMessages, saveChatMessages, type ShadowLearnDB } from '../db';

interface UseChatResult {
	messages: ChatMessage[];
	isStreaming: boolean;
	sendMessage: (content: string) => Promise<void>;
}

export function useChat(
	db: ShadowLearnDB | null,
	lessonId: string | undefined,
	videoTitle: string,
	activeSegment: Segment | null,
	contextSegments: Segment[],
	keys: DecryptedKeys | null,
	model: string,
): UseChatResult {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [isStreaming, setIsStreaming] = useState(false);
	const abortRef = useRef<AbortController | null>(null);

	// Load chat history
	useEffect(() => {
		if (!db || !lessonId) return;
		getChatMessages(db, lessonId).then((saved) => {
			if (saved) setMessages(saved);
		});
	}, [db, lessonId]);

	// Persist on change
	useEffect(() => {
		if (!db || !lessonId || messages.length === 0) return;
		saveChatMessages(db, lessonId, messages);
	}, [db, lessonId, messages]);

	const sendMessage = useCallback(
		async (content: string) => {
			if (!keys || isStreaming) return;

			const userMsg: ChatMessage = {
				role: 'user',
				content,
				timestamp: new Date().toISOString(),
			};

			const updated = [...messages, userMsg];
			setMessages(updated);
			setIsStreaming(true);

			try {
				abortRef.current = new AbortController();

				const response = await fetch('/api/chat', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						messages: updated
							.slice(-20)
							.map((m) => ({ role: m.role, content: m.content })),
						video_title: videoTitle,
						active_segment: activeSegment,
						context_segments: contextSegments.slice(-40),
						openrouter_api_key: keys.openrouterApiKey,
						openrouter_model: model,
					}),
					signal: abortRef.current.signal,
				});

				if (!response.ok) {
					throw new Error(`Chat failed: ${response.statusText}`);
				}

				const reader = response.body?.getReader();
				if (!reader) throw new Error('No response body');

				const decoder = new TextDecoder();
				let assistantContent = '';

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const text = decoder.decode(value, { stream: true });
					const lines = text.split('\n');

					for (const line of lines) {
						if (line.startsWith('data: ')) {
							const data = line.slice(6);
							try {
								const parsed = JSON.parse(data);
								if (parsed.content) {
									assistantContent += parsed.content;
									setMessages([
										...updated,
										{
											role: 'assistant',
											content: assistantContent,
											timestamp: new Date().toISOString(),
										},
									]);
								}
							} catch {
								// skip malformed SSE chunks
							}
						}
					}
				}

				// Final message
				if (assistantContent) {
					setMessages([
						...updated,
						{
							role: 'assistant',
							content: assistantContent,
							timestamp: new Date().toISOString(),
						},
					]);
				}
			} catch (e) {
				if (e instanceof Error && e.name !== 'AbortError') {
					setMessages([
						...updated,
						{
							role: 'assistant',
							content: `Error: ${e.message}`,
							timestamp: new Date().toISOString(),
						},
					]);
				}
			} finally {
				setIsStreaming(false);
			}
		},
		[
			messages,
			keys,
			isStreaming,
			videoTitle,
			activeSegment,
			contextSegments,
			model,
		],
	);

	return { messages, isStreaming, sendMessage };
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/
git commit -m "feat: add useLesson, useActiveSegment, and useChat hooks"
```

---

## Chunk 4: Frontend Screens (Onboarding, Library, Create Lesson, Settings)

> **shadcn/ui directive:** All components in this chunk MUST use shadcn/ui
> components instead of raw Tailwind markup. Use `<Button>` from
> `@/components/ui/button`, `<Input>` from `@/components/ui/input`, `<Card>` /
> `<CardHeader>` / `<CardContent>` from `@/components/ui/card`, `<Tabs>` /
> `<TabsList>` / `<TabsTrigger>` / `<TabsContent>` from `@/components/ui/tabs`,
> `<Select>` from `@/components/ui/select`, `<Badge>` from
> `@/components/ui/badge`, `<Dialog>` from `@/components/ui/dialog`, etc. The
> code samples below show the general structure — implementers should replace
> raw `<button>`, `<input>`, `<select>` elements with their shadcn equivalents
> and use `cn()` from `@/lib/utils` for conditional class merging. Run
> `npx eslint . --fix` after implementing each component.

### Task 16: Layout Component (Top Nav)

**Files:**

- Create: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: Implement Layout**

Create `frontend/src/components/Layout.tsx`:

```typescript
import { Link, useLocation } from "react-router-dom";

interface LayoutProps {
  children: React.ReactNode;
  onSearch?: (query: string) => void;
  searchValue?: string;
}

export default function Layout({ children, onSearch, searchValue }: LayoutProps) {
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <div className="h-screen bg-slate-900 text-slate-100">
      <nav className="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700">
        <Link to="/" className="text-xl font-bold text-white tracking-tight">
          ShadowLearn
        </Link>

        <div className="flex items-center gap-4">
          {isHome && onSearch && (
            <input
              type="text"
              placeholder="Search lessons..."
              value={searchValue || ""}
              onChange={(e) => onSearch(e.target.value)}
              className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-sm text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
          )}

          <Link
            to="/create"
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-md transition-colors"
          >
            + New Lesson
          </Link>

          <Link
            to="/settings"
            className="p-2 text-slate-400 hover:text-white transition-colors"
            aria-label="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </Link>
        </div>
      </nav>

      <main>{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Layout.tsx
git commit -m "feat: add Layout component with top navigation bar"
```

---

### Task 17: Onboarding Setup Screen

**Files:**

- Create: `frontend/src/components/onboarding/Setup.tsx`

- [ ] **Step 1: Implement Setup screen**

Create `frontend/src/components/onboarding/Setup.tsx`:

```typescript
import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";

export default function Setup() {
  const { setup } = useAuth();
  const [elevenlabsKey, setElevenlabsKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!elevenlabsKey.trim() || !openrouterKey.trim()) {
      setError("Both API keys are required.");
      return;
    }
    if (pin.length < 4) {
      setError("PIN must be at least 4 characters.");
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs do not match.");
      return;
    }

    setSaving(true);
    try {
      await setup(
        { elevenlabsApiKey: elevenlabsKey.trim(), openrouterApiKey: openrouterKey.trim() },
        pin
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800 rounded-xl p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-white mb-2">Welcome to ShadowLearn</h1>
        <p className="text-slate-400 text-sm mb-6">
          To get started, enter your API keys below. They are encrypted locally with your
          PIN and never leave your device.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              ElevenLabs API Key
            </label>
            <input
              type="password"
              value={elevenlabsKey}
              onChange={(e) => setElevenlabsKey(e.target.value)}
              placeholder="Enter your ElevenLabs API key"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              Used for speech-to-text transcription (Scribe).
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              OpenRouter API Key
            </label>
            <input
              type="password"
              value={openrouterKey}
              onChange={(e) => setOpenrouterKey(e.target.value)}
              placeholder="Enter your OpenRouter API key"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              Used for translations and AI companion chat.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">PIN</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Choose a PIN (4+ characters)"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Confirm PIN
            </label>
            <input
              type="password"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              placeholder="Re-enter your PIN"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white font-medium rounded-md transition-colors"
          >
            {saving ? "Encrypting & saving..." : "Save & Get Started"}
          </button>
        </form>

        <div className="mt-6 p-3 bg-slate-700/50 rounded-lg">
          <p className="text-xs text-slate-400">
            Your API keys are encrypted with AES-256-GCM using your PIN. They are stored
            only in your browser and never sent to any server except the respective API
            providers.
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/onboarding/Setup.tsx
git commit -m "feat: add first-launch setup screen for API key onboarding"
```

---

### Task 18: PIN Unlock Screen

**Files:**

- Create: `frontend/src/components/onboarding/Unlock.tsx`

- [ ] **Step 1: Implement Unlock screen**

Create `frontend/src/components/onboarding/Unlock.tsx`:

```typescript
import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";

export default function Unlock() {
  const { unlock, resetKeys } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [showReset, setShowReset] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setUnlocking(true);

    try {
      await unlock(pin);
    } catch {
      setError("Incorrect PIN. Please try again.");
      setPin("");
    } finally {
      setUnlocking(false);
    }
  }

  async function handleReset() {
    await resetKeys();
  }

  return (
    <div className="h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-800 rounded-xl p-8 shadow-xl">
        <h1 className="text-xl font-bold text-white mb-2">ShadowLearn</h1>
        <p className="text-slate-400 text-sm mb-6">Enter your PIN to unlock.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Enter PIN"
            autoFocus
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg tracking-widest"
          />

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={unlocking || !pin}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white font-medium rounded-md transition-colors"
          >
            {unlocking ? "Unlocking..." : "Unlock"}
          </button>
        </form>

        <div className="mt-4 text-center">
          {!showReset ? (
            <button
              onClick={() => setShowReset(true)}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Forgot PIN?
            </button>
          ) : (
            <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg">
              <p className="text-xs text-red-300 mb-2">
                This will erase your encrypted API keys. You will need to re-enter them.
              </p>
              <button
                onClick={handleReset}
                className="text-xs text-red-400 hover:text-red-300 font-medium"
              >
                Reset keys & set new PIN
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/onboarding/Unlock.tsx
git commit -m "feat: add PIN unlock screen with forgot-PIN reset flow"
```

---

### Task 19: Wire Auth Guards into App.tsx

**Files:**

- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Update App.tsx with auth gating**

Replace `frontend/src/App.tsx`:

```typescript
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Setup from "./components/onboarding/Setup";
import Unlock from "./components/onboarding/Unlock";

function Placeholder({ name }: { name: string }) {
  return <div className="p-8 text-white">{name} — coming soon</div>;
}

function AuthGate() {
  const { isFirstSetup, isUnlocked } = useAuth();

  // Still loading
  if (isFirstSetup === null) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  // First launch — show setup
  if (isFirstSetup) return <Setup />;

  // Locked — show PIN entry
  if (!isUnlocked) return <Unlock />;

  // Unlocked — show app
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Placeholder name="Library" />} />
        <Route path="/create" element={<Placeholder name="Create Lesson" />} />
        <Route path="/lesson/:id" element={<Placeholder name="Lesson View" />} />
        <Route path="/settings" element={<Placeholder name="Settings" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: add auth gating — setup, unlock, then app routes"
```

---

### Task 20: Library Screen

**Files:**

- Create: `frontend/src/components/library/LessonCard.tsx`
- Create: `frontend/src/components/library/Library.tsx`

- [ ] **Step 1: Implement LessonCard**

Create `frontend/src/components/library/LessonCard.tsx`:

```typescript
import { Link } from "react-router-dom";
import type { LessonMeta } from "../../types";

interface LessonCardProps {
  lesson: LessonMeta;
  onDelete: (id: string) => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function LessonCard({ lesson, onDelete }: LessonCardProps) {
  const progressPercent = lesson.progressSegmentId
    ? Math.min(100, Math.round((parseInt(lesson.progressSegmentId.split("_")[1]) / lesson.segmentCount) * 100))
    : 0;

  return (
    <Link
      to={`/lesson/${lesson.id}`}
      className="relative block bg-slate-800 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors overflow-hidden group"
    >
      <div className="h-32 bg-slate-700 flex items-center justify-center">
        <span className="text-4xl text-slate-500">
          {lesson.source === "youtube" ? "▶" : "📁"}
        </span>
      </div>

      <div className="p-4">
        <h3 className="font-medium text-white truncate mb-1">{lesson.title}</h3>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>{formatDuration(lesson.duration)}</span>
          <span>{lesson.segmentCount} segments</span>
        </div>

        {lesson.tags.length > 0 && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {lesson.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3">
          <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDelete(lesson.id);
        }}
        className="absolute top-2 right-2 p-1 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Delete lesson"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </Link>
  );
}
```

- [ ] **Step 2: Implement Library**

Create `frontend/src/components/library/Library.tsx`:

```typescript
import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import Layout from "../Layout";
import LessonCard from "./LessonCard";
import { useAuth } from "../../contexts/AuthContext";
import { getAllLessonMetas, deleteFullLesson } from "../../db";
import type { LessonMeta } from "../../types";

type SortMode = "recent" | "alphabetical" | "progress";

export default function Library() {
  const { db } = useAuth();
  const [lessons, setLessons] = useState<LessonMeta[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");

  useEffect(() => {
    if (!db) return;
    getAllLessonMetas(db).then(setLessons);
  }, [db]);

  const filtered = useMemo(() => {
    let result = lessons;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((l) => l.title.toLowerCase().includes(q));
    }

    switch (sort) {
      case "recent":
        result = [...result].sort(
          (a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime()
        );
        break;
      case "alphabetical":
        result = [...result].sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "progress":
        result = [...result].sort((a, b) => {
          const pa = a.progressSegmentId ? parseInt(a.progressSegmentId.split("_")[1]) / a.segmentCount : 0;
          const pb = b.progressSegmentId ? parseInt(b.progressSegmentId.split("_")[1]) / b.segmentCount : 0;
          return pb - pa;
        });
        break;
    }

    return result;
  }, [lessons, search, sort]);

  async function handleDelete(id: string) {
    if (!db) return;
    await deleteFullLesson(db, id);
    setLessons((prev) => prev.filter((l) => l.id !== id));
  }

  return (
    <Layout onSearch={setSearch} searchValue={search}>
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Your Lessons</h2>
          <div className="flex gap-1">
            {(["recent", "alphabetical", "progress"] as SortMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setSort(mode)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  sort === mode
                    ? "bg-blue-600 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <Link
            to="/create"
            className="flex items-center justify-center h-48 border-2 border-dashed border-slate-600 rounded-lg text-slate-400 hover:border-blue-500 hover:text-blue-400 transition-colors"
          >
            <div className="text-center">
              <span className="text-3xl block mb-1">+</span>
              <span className="text-sm">Add new lesson</span>
            </div>
          </Link>

          {filtered.map((lesson) => (
            <div key={lesson.id} className="relative">
              <LessonCard lesson={lesson} onDelete={handleDelete} />
            </div>
          ))}
        </div>

        {lessons.length === 0 && (
          <p className="text-center text-slate-500 mt-8">
            No lessons yet. Create your first lesson to start learning!
          </p>
        )}
      </div>
    </Layout>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/library/
git commit -m "feat: add Library screen with lesson cards, search, and sort"
```

---

### Task 21: Create Lesson Screen

**Files:**

- Create: `frontend/src/components/create/YouTubeTab.tsx`
- Create: `frontend/src/components/create/UploadTab.tsx`
- Create: `frontend/src/components/create/ProcessingStatus.tsx`
- Create: `frontend/src/components/create/CreateLesson.tsx`

- [ ] **Step 1: Implement YouTubeTab**

Create `frontend/src/components/create/YouTubeTab.tsx`:

```typescript
interface YouTubeTabProps {
  url: string;
  onUrlChange: (url: string) => void;
}

export default function YouTubeTab({ url, onUrlChange }: YouTubeTabProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">
        YouTube URL
      </label>
      <input
        type="url"
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder="https://www.youtube.com/watch?v=..."
        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
```

- [ ] **Step 2: Implement UploadTab**

Create `frontend/src/components/create/UploadTab.tsx`:

```typescript
import { useCallback } from "react";

interface UploadTabProps {
  file: File | null;
  onFileSelect: (file: File) => void;
}

const ACCEPTED_FORMATS = ".mp4,.mkv,.webm,.mov";
const MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
const MAX_DURATION_SECONDS = 7200; // 2 hours

export default function UploadTab({ file, onFileSelect }: UploadTabProps) {
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) onFileSelect(droppedFile);
    },
    [onFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) onFileSelect(selected);
    },
    [onFileSelect]
  );

  function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
    return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
  }

  const sizeError = file && file.size > MAX_SIZE_BYTES;

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer"
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept={ACCEPTED_FORMATS}
          onChange={handleFileInput}
          className="hidden"
        />
        {file ? (
          <div>
            <p className="text-white font-medium">{file.name}</p>
            <p className={`text-sm mt-1 ${sizeError ? "text-red-400" : "text-slate-400"}`}>
              {formatSize(file.size)}
              {sizeError && " — exceeds 2 GB limit"}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-slate-400 mb-1">Drop a video file here or click to browse</p>
            <p className="text-xs text-slate-500">mp4, mkv, webm, mov — max 2 GB, 2 hours</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement ProcessingStatus**

Create `frontend/src/components/create/ProcessingStatus.tsx`:

```typescript
interface Step {
  key: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
  error?: string;
}

interface ProcessingStatusProps {
  steps: Step[];
  onRetry?: () => void;
}

export default function ProcessingStatus({ steps, onRetry }: ProcessingStatusProps) {
  return (
    <div className="space-y-3">
      {steps.map((step) => (
        <div
          key={step.key}
          className={`flex items-center gap-3 p-3 rounded-lg ${
            step.status === "active"
              ? "bg-blue-900/30 border border-blue-700"
              : step.status === "done"
              ? "bg-green-900/20 border border-green-800"
              : step.status === "error"
              ? "bg-red-900/20 border border-red-800"
              : "bg-slate-800 border border-slate-700"
          }`}
        >
          <div className="flex-shrink-0">
            {step.status === "pending" && (
              <div className="w-5 h-5 rounded-full border-2 border-slate-600" />
            )}
            {step.status === "active" && (
              <div className="w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
            )}
            {step.status === "done" && (
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-white text-xs">
                ✓
              </div>
            )}
            {step.status === "error" && (
              <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white text-xs">
                ✕
              </div>
            )}
          </div>

          <div className="flex-1">
            <span className={`text-sm ${step.status === "active" ? "text-blue-300" : "text-slate-300"}`}>
              {step.label}
            </span>
            {step.status === "error" && step.error && (
              <p className="text-xs text-red-400 mt-1">{step.error}</p>
            )}
          </div>

          {step.status === "error" && onRetry && (
            <button
              onClick={onRetry}
              className="px-2 py-1 text-xs bg-red-800 hover:bg-red-700 text-red-200 rounded transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Implement CreateLesson**

Create `frontend/src/components/create/CreateLesson.tsx`:

```typescript
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../Layout";
import YouTubeTab from "./YouTubeTab";
import UploadTab from "./UploadTab";
import ProcessingStatus from "./ProcessingStatus";
import { useAuth } from "../../contexts/AuthContext";
import { saveLessonMeta, saveSegments, saveVideo } from "../../db";

type Tab = "youtube" | "upload";
type StepStatus = "pending" | "active" | "done" | "error";

interface PipelineStep {
  key: string;
  label: string;
  status: StepStatus;
  error?: string;
}

const INITIAL_STEPS: PipelineStep[] = [
  { key: "validation", label: "Validating input", status: "pending" },
  { key: "audio", label: "Extracting audio", status: "pending" },
  { key: "transcription", label: "Transcribing speech", status: "pending" },
  { key: "pinyin", label: "Generating pinyin", status: "pending" },
  { key: "translation", label: "Translating & building word list", status: "pending" },
];

export default function CreateLesson() {
  const { keys, db } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>("youtube");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [translationLang, setTranslationLang] = useState("en");
  const [model, setModel] = useState("openai/gpt-4o-mini");
  const [processing, setProcessing] = useState(false);
  const [steps, setSteps] = useState<PipelineStep[]>(INITIAL_STEPS);
  const [error, setError] = useState("");

  function updateStep(key: string, status: StepStatus, errorMsg?: string) {
    setSteps((prev) =>
      prev.map((s) =>
        s.key === key ? { ...s, status, error: errorMsg } : s
      )
    );
  }

  async function handleGenerate() {
    if (!keys || !db) return;
    setProcessing(true);
    setError("");
    setSteps(INITIAL_STEPS);

    try {
      let response: Response;

      if (tab === "youtube") {
        response = await fetch("/api/lessons/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "youtube",
            youtube_url: youtubeUrl,
            translation_languages: [translationLang],
            openrouter_api_key: keys.openrouterApiKey,
            openrouter_model: model,
            elevenlabs_api_key: keys.elevenlabsApiKey,
          }),
        });
      } else {
        if (!uploadFile) {
          setError("Please select a video file.");
          setProcessing(false);
          return;
        }
        const formData = new FormData();
        formData.append("file", uploadFile);
        formData.append("translation_languages", JSON.stringify([translationLang]));
        formData.append("openrouter_api_key", keys.openrouterApiKey);
        formData.append("openrouter_model", model);
        formData.append("elevenlabs_api_key", keys.elevenlabsApiKey);

        response = await fetch("/api/lessons/generate-upload", {
          method: "POST",
          body: formData,
        });
      }

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Request failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));

            if (currentEvent === "step" || data.step) {
              updateStep(data.step, data.status);
            } else if (currentEvent === "error" || data.message) {
              setError(data.message);
              setSteps((prev) =>
                prev.map((s) =>
                  s.status === "active" ? { ...s, status: "error", error: data.message } : s
                )
              );
            } else if (currentEvent === "complete" || data.segments) {
              // Save lesson to IndexedDB
              const lessonId = `lesson_${Date.now()}`;
              await saveLessonMeta(db, {
                id: lessonId,
                title: data.title,
                source: data.source,
                sourceUrl: data.source_url,
                duration: data.duration,
                segmentCount: data.segments.length,
                translationLanguages: data.translation_languages,
                createdAt: new Date().toISOString(),
                lastOpenedAt: new Date().toISOString(),
                progressSegmentId: null,
                tags: [],
              });
              await saveSegments(db, lessonId, data.segments);

              // Save uploaded video blob if applicable
              if (tab === "upload" && uploadFile) {
                await saveVideo(db, lessonId, uploadFile);
              }

              navigate(`/lesson/${lessonId}`);
            }
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "An error occurred");
    } finally {
      setProcessing(false);
    }
  }

  const canGenerate =
    !processing &&
    keys &&
    (tab === "youtube" ? youtubeUrl.trim() !== "" : uploadFile !== null);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto p-6">
        <h2 className="text-lg font-semibold text-white mb-6">Create New Lesson</h2>

        {!processing ? (
          <>
            <div className="flex gap-1 mb-6">
              <button
                onClick={() => setTab("youtube")}
                className={`px-4 py-2 text-sm rounded-md transition-colors ${
                  tab === "youtube"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                YouTube URL
              </button>
              <button
                onClick={() => setTab("upload")}
                className={`px-4 py-2 text-sm rounded-md transition-colors ${
                  tab === "upload"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                Upload Video
              </button>
            </div>

            <div className="space-y-4">
              {tab === "youtube" ? (
                <YouTubeTab url={youtubeUrl} onUrlChange={setYoutubeUrl} />
              ) : (
                <UploadTab file={uploadFile} onFileSelect={setUploadFile} />
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Translation Language
                </label>
                <select
                  value={translationLang}
                  onChange={(e) => setTranslationLang(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="en">English (en)</option>
                  <option value="vi">Vietnamese (vi)</option>
                  <option value="ja">Japanese (ja)</option>
                  <option value="ko">Korean (ko)</option>
                  <option value="fr">French (fr)</option>
                  <option value="es">Spanish (es)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  AI Model
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white font-medium rounded-md transition-colors"
              >
                Generate Lesson
              </button>
            </div>
          </>
        ) : (
          <ProcessingStatus steps={steps} onRetry={handleGenerate} />
        )}
      </div>
    </Layout>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/create/
git commit -m "feat: add Create Lesson screen with YouTube/upload tabs and SSE progress"
```

---

### Task 22: Settings Screen

**Files:**

- Create: `frontend/src/components/settings/Settings.tsx`

- [ ] **Step 1: Implement Settings**

Create `frontend/src/components/settings/Settings.tsx`:

```typescript
import { useState, useEffect } from "react";
import Layout from "../Layout";
import { useAuth } from "../../contexts/AuthContext";
import { getSettings, saveSettings } from "../../db";
import { encryptKeys } from "../../crypto";
import { saveCryptoData } from "../../db";
import type { AppSettings } from "../../types";

export default function Settings() {
  const { db, keys, resetKeys, lock } = useAuth();
  const [settings, setSettingsState] = useState<AppSettings>({
    translationLanguage: "en",
    defaultModel: "openai/gpt-4o-mini",
  });
  const [changePinNew, setChangePinNew] = useState("");
  const [changePinConfirm, setChangePinConfirm] = useState("");
  const [pinMessage, setPinMessage] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!db) return;
    getSettings(db).then((s) => {
      if (s) setSettingsState(s);
    });
  }, [db]);

  async function handleSaveSettings() {
    if (!db) return;
    await saveSettings(db, settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleChangePin() {
    if (!db || !keys) return;
    setPinMessage("");

    if (changePinNew.length < 4) {
      setPinMessage("New PIN must be at least 4 characters.");
      return;
    }
    if (changePinNew !== changePinConfirm) {
      setPinMessage("New PINs do not match.");
      return;
    }

    try {
      // Re-encrypt keys with new PIN
      const encrypted = await encryptKeys(keys, changePinNew);
      await saveCryptoData(db, encrypted);
      setPinMessage("PIN changed successfully.");
      setChangePinNew("");
      setChangePinConfirm("");
    } catch {
      setPinMessage("Failed to change PIN.");
    }
  }

  async function handleForgotPin() {
    if (window.confirm("This will erase your encrypted API keys. You will need to re-enter them. Continue?")) {
      await resetKeys();
    }
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        <h2 className="text-lg font-semibold text-white">Settings</h2>

        {/* API Keys */}
        <section className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-md font-medium text-white mb-4">API Keys</h3>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-300">ElevenLabs API Key</p>
                <p className="text-xs text-slate-500 font-mono">
                  {keys ? "••••••••" + keys.elevenlabsApiKey.slice(-4) : "Locked"}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-300">OpenRouter API Key</p>
                <p className="text-xs text-slate-500 font-mono">
                  {keys ? "••••••••" + keys.openrouterApiKey.slice(-4) : "Locked"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-slate-700/50 rounded-lg">
            <p className="text-xs text-slate-400">
              Keys are AES-256-GCM encrypted with your PIN and never leave this device.
            </p>
          </div>
        </section>

        {/* Change PIN */}
        <section className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-md font-medium text-white mb-4">Change PIN</h3>
          <div className="space-y-3">
            <input
              type="password"
              placeholder="New PIN"
              value={changePinNew}
              onChange={(e) => setChangePinNew(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="password"
              placeholder="Confirm new PIN"
              value={changePinConfirm}
              onChange={(e) => setChangePinConfirm(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {pinMessage && (
              <p className={`text-sm ${pinMessage.includes("success") ? "text-green-400" : "text-red-400"}`}>
                {pinMessage}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleChangePin}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-md transition-colors"
              >
                Change PIN
              </button>
              <button
                onClick={handleForgotPin}
                className="px-4 py-2 text-red-400 hover:text-red-300 text-sm transition-colors"
              >
                Forgot PIN
              </button>
            </div>
          </div>
        </section>

        {/* Language */}
        <section className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-md font-medium text-white mb-4">Language</h3>
          <label className="block text-sm text-slate-300 mb-1">Default translation language</label>
          <select
            value={settings.translationLanguage}
            onChange={(e) => setSettingsState({ ...settings, translationLanguage: e.target.value })}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="en">English (en)</option>
            <option value="vi">Vietnamese (vi)</option>
            <option value="ja">Japanese (ja)</option>
            <option value="ko">Korean (ko)</option>
            <option value="fr">French (fr)</option>
            <option value="es">Spanish (es)</option>
          </select>
        </section>

        {/* AI Model */}
        <section className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-md font-medium text-white mb-4">AI Model</h3>
          <label className="block text-sm text-slate-300 mb-1">Default OpenRouter model</label>
          <input
            type="text"
            value={settings.defaultModel}
            onChange={(e) => setSettingsState({ ...settings, defaultModel: e.target.value })}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </section>

        <div className="flex gap-3">
          <button
            onClick={handleSaveSettings}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-md transition-colors"
          >
            {saved ? "Saved!" : "Save Settings"}
          </button>
          <button
            onClick={lock}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-md transition-colors"
          >
            Lock App
          </button>
        </div>
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/settings/Settings.tsx
git commit -m "feat: add Settings screen with API keys, PIN, language, and model config"
```

---

### Task 23: Wire Real Components into App.tsx Routes

**Files:**

- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Replace placeholders with real components**

Update `frontend/src/App.tsx`:

```typescript
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { PlayerProvider } from "./contexts/PlayerContext";
import Setup from "./components/onboarding/Setup";
import Unlock from "./components/onboarding/Unlock";
import Library from "./components/library/Library";
import CreateLesson from "./components/create/CreateLesson";
import Settings from "./components/settings/Settings";

function Placeholder({ name }: { name: string }) {
  return <div className="p-8 text-white">{name} — coming soon</div>;
}

function AuthGate() {
  const { isFirstSetup, isUnlocked } = useAuth();

  if (isFirstSetup === null) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  if (isFirstSetup) return <Setup />;
  if (!isUnlocked) return <Unlock />;

  return (
    <PlayerProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/create" element={<CreateLesson />} />
          <Route path="/lesson/:id" element={<Placeholder name="Lesson View" />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </BrowserRouter>
    </PlayerProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire Library, CreateLesson, and Settings into routes"
```

---

## Chunk 5: Frontend Lesson View (3-Panel)

> **shadcn/ui directive:** Same as Chunk 4 — use shadcn/ui components (`Button`,
> `Tooltip`, `TooltipTrigger`, `TooltipContent`, `ScrollArea`, `Textarea`,
> `Badge`, `Separator`) instead of raw Tailwind elements. Use `cn()` for
> conditional classes. Run `npx eslint . --fix` after each component.

### Task 24: VideoPanel Component

**Files:**

- Create: `frontend/src/components/lesson/VideoPanel.tsx`

- [ ] **Step 1: Implement VideoPanel**

Create `frontend/src/components/lesson/VideoPanel.tsx`:

```typescript
import { useRef, useEffect, useCallback, useState } from "react";
import { usePlayer } from "../../contexts/PlayerContext";
import { HTML5Player } from "../../player/HTML5Player";
import { YouTubePlayer } from "../../player/YouTubePlayer";
import type { LessonMeta, Segment } from "../../types";

interface VideoPanelProps {
  lesson: LessonMeta;
  segments: Segment[];
  activeSegment: Segment | null;
  videoBlob?: Blob;
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5];

export default function VideoPanel({
  lesson,
  segments,
  activeSegment,
  videoBlob,
}: VideoPanelProps) {
  const { player, currentTime, playbackRate, setPlayer, setPlaybackRate } = usePlayer();
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(lesson.duration);

  // Initialize player
  useEffect(() => {
    if (lesson.source === "youtube" && lesson.sourceUrl) {
      // Extract video ID — handles both youtube.com/watch?v= and youtu.be/ formats
      let videoId: string | null = null;
      try {
        const url = new URL(lesson.sourceUrl);
        videoId = url.searchParams.get("v") || url.pathname.split("/").pop() || null;
      } catch {
        // sourceUrl stored during lesson creation should always be valid
      }
      if (videoId && ytContainerRef.current) {
        const yt = new YouTubePlayer("yt-player", videoId);
        setPlayer(yt);
        return () => yt.destroy();
      }
    } else if (lesson.source === "upload" && videoRef.current) {
      if (videoBlob) {
        videoRef.current.src = URL.createObjectURL(videoBlob);
      }
      const html5 = new HTML5Player(videoRef.current);
      setPlayer(html5);
      return () => html5.destroy();
    }
  }, [lesson, videoBlob, setPlayer]);

  // Track duration
  useEffect(() => {
    if (player) {
      const d = player.getDuration();
      if (d > 0) setDuration(d);
    }
  }, [player, currentTime]);

  const togglePlay = useCallback(() => {
    if (!player) return;
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  }, [player, isPlaying]);

  const jumpPrev = useCallback(() => {
    if (!player || !activeSegment || segments.length === 0) return;
    const idx = segments.findIndex((s) => s.id === activeSegment.id);
    if (idx > 0) {
      player.seekTo(segments[idx - 1].start);
      player.play();
      setIsPlaying(true);
    }
  }, [player, activeSegment, segments]);

  const jumpNext = useCallback(() => {
    if (!player || !activeSegment || segments.length === 0) return;
    const idx = segments.findIndex((s) => s.id === activeSegment.id);
    if (idx < segments.length - 1) {
      player.seekTo(segments[idx + 1].start);
      player.play();
      setIsPlaying(true);
    }
  }, [player, activeSegment, segments]);

  function handleScrub(e: React.ChangeEvent<HTMLInputElement>) {
    const time = parseFloat(e.target.value);
    player?.seekTo(time);
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Video area */}
      <div className="flex-1 bg-black flex items-center justify-center">
        {lesson.source === "youtube" ? (
          <div ref={ytContainerRef} className="w-full aspect-video">
            <div id="yt-player" className="w-full h-full" />
          </div>
        ) : (
          <video ref={videoRef} className="w-full aspect-video" />
        )}
      </div>

      {/* Custom controls */}
      <div className="p-3 bg-slate-800 border-t border-slate-700 space-y-2">
        {/* Scrubber */}
        <input
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={currentTime}
          onChange={handleScrub}
          className="w-full h-1 appearance-none bg-slate-600 rounded-full cursor-pointer accent-blue-500"
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={jumpPrev} className="p-1 text-slate-400 hover:text-white transition-colors" title="Previous segment">
              ⏮
            </button>
            <button onClick={togglePlay} className="p-1 text-white hover:text-blue-400 transition-colors text-lg">
              {isPlaying ? "⏸" : "▶"}
            </button>
            <button onClick={jumpNext} className="p-1 text-slate-400 hover:text-white transition-colors" title="Next segment">
              ⏭
            </button>
          </div>

          <span className="text-xs text-slate-400 font-mono">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex gap-1">
            {PLAYBACK_RATES.map((rate) => (
              <button
                key={rate}
                onClick={() => setPlaybackRate(rate)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  playbackRate === rate
                    ? "bg-blue-600 text-white"
                    : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="px-3 py-2 bg-slate-800 border-t border-slate-700">
        <p className="text-sm font-medium text-white truncate">{lesson.title}</p>
        <p className="text-xs text-slate-400">
          {formatTime(lesson.duration)} · {lesson.segmentCount} segments
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/lesson/VideoPanel.tsx
git commit -m "feat: add VideoPanel with player controls, scrubber, and speed selector"
```

---

### Task 25: WordTooltip Component

**Files:**

- Create: `frontend/src/components/lesson/WordTooltip.tsx`

- [ ] **Step 1: Implement WordTooltip**

Create `frontend/src/components/lesson/WordTooltip.tsx`:

```typescript
import { useState, useRef, useEffect } from "react";
import type { Word } from "../../types";

interface WordTooltipProps {
  text: string;
  words: Word[];
}

export default function WordTooltip({ text, words }: WordTooltipProps) {
  const [activeWord, setActiveWord] = useState<Word | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLSpanElement>(null);

  // Build a map of word positions in the text
  const wordSpans = buildWordSpans(text, words);

  function handleMouseEnter(word: Word, e: React.MouseEvent) {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (containerRect) {
      setTooltipPos({
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top,
      });
    }
    setActiveWord(word);
  }

  function handleMouseLeave() {
    setActiveWord(null);
  }

  return (
    <span ref={containerRef} className="relative inline">
      {wordSpans.map((span, i) =>
        span.word ? (
          <span
            key={i}
            className="cursor-help hover:bg-blue-900/40 hover:text-blue-300 rounded px-0.5 transition-colors"
            onMouseEnter={(e) => handleMouseEnter(span.word!, e)}
            onMouseLeave={handleMouseLeave}
          >
            {span.text}
          </span>
        ) : (
          <span key={i}>{span.text}</span>
        )
      )}

      {activeWord && (
        <div
          className="absolute z-50 w-64 bg-slate-700 border border-slate-600 rounded-lg shadow-xl p-3 text-left pointer-events-none"
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y - 8}px`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="text-lg text-white font-medium">{activeWord.word}</div>
          <div className="text-sm text-blue-300">{activeWord.pinyin}</div>
          <div className="text-sm text-slate-300 mt-1">{activeWord.meaning}</div>
          {activeWord.usage && (
            <div className="text-xs text-slate-400 mt-1 italic">{activeWord.usage}</div>
          )}
        </div>
      )}
    </span>
  );
}

interface WordSpan {
  text: string;
  word: Word | null;
}

function buildWordSpans(text: string, words: Word[]): WordSpan[] {
  if (words.length === 0) {
    return [{ text, word: null }];
  }

  const spans: WordSpan[] = [];
  let remaining = text;

  // Sort words by length descending for greedy matching
  const sortedWords = [...words].sort((a, b) => b.word.length - a.word.length);

  while (remaining.length > 0) {
    let matched = false;
    for (const word of sortedWords) {
      if (remaining.startsWith(word.word)) {
        spans.push({ text: word.word, word });
        remaining = remaining.slice(word.word.length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Take one character as unmatched text
      const lastSpan = spans[spans.length - 1];
      if (lastSpan && !lastSpan.word) {
        lastSpan.text += remaining[0];
      } else {
        spans.push({ text: remaining[0], word: null });
      }
      remaining = remaining.slice(1);
    }
  }

  return spans;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/lesson/WordTooltip.tsx
git commit -m "feat: add WordTooltip component for hover word explanations"
```

---

### Task 26: TranscriptPanel Component

**Files:**

- Create: `frontend/src/components/lesson/TranscriptPanel.tsx`

- [ ] **Step 1: Implement TranscriptPanel**

Create `frontend/src/components/lesson/TranscriptPanel.tsx`:

```typescript
import { useState, useRef, useEffect, useMemo } from "react";
import { usePlayer } from "../../contexts/PlayerContext";
import WordTooltip from "./WordTooltip";
import type { Segment, LessonMeta } from "../../types";

interface TranscriptPanelProps {
  segments: Segment[];
  activeSegment: Segment | null;
  lesson: LessonMeta;
  onSegmentClick: (segment: Segment) => void;
  onProgressUpdate: (segmentId: string) => void;
}

export default function TranscriptPanel({
  segments,
  activeSegment,
  lesson,
  onSegmentClick,
  onProgressUpdate,
}: TranscriptPanelProps) {
  const [search, setSearch] = useState("");
  const [displayLang, setDisplayLang] = useState(lesson.translationLanguages[0] || "en");
  const activeRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll active segment into view
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (activeSegment) {
      onProgressUpdate(activeSegment.id);
    }
  }, [activeSegment?.id]);

  // Filter segments by search
  const filteredSegments = useMemo(() => {
    if (!search) return segments;
    const q = search.toLowerCase();
    return segments.filter(
      (s) =>
        s.chinese.toLowerCase().includes(q) ||
        Object.values(s.translations).some((t) => t.toLowerCase().includes(q))
    );
  }, [segments, search]);

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Header */}
      <div className="p-3 bg-slate-800 border-b border-slate-700 space-y-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search transcript..."
          className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {lesson.translationLanguages.length > 1 && (
          <div className="flex gap-1">
            {lesson.translationLanguages.map((lang) => (
              <button
                key={lang}
                onClick={() => setDisplayLang(lang)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  displayLang === lang
                    ? "bg-blue-600 text-white"
                    : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                }`}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Segment list */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {filteredSegments.map((segment) => {
          const isActive = activeSegment?.id === segment.id;
          return (
            <div
              key={segment.id}
              ref={isActive ? activeRef : undefined}
              onClick={() => onSegmentClick(segment)}
              className={`px-4 py-3 cursor-pointer border-l-2 transition-colors group ${
                isActive
                  ? "border-blue-500 bg-slate-800"
                  : "border-transparent hover:bg-slate-800/50"
              }`}
            >
              <div className="text-xs text-slate-500 mb-1">
                <WordTooltip text={segment.pinyin} words={[]} />
              </div>
              <div className="text-base text-white leading-relaxed">
                <WordTooltip text={segment.chinese} words={segment.words} />
              </div>
              <div className="text-sm text-slate-400 mt-1">
                {segment.translations[displayLang] || ""}
              </div>
              <div className="text-xs text-slate-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {formatTime(segment.start)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/lesson/TranscriptPanel.tsx
git commit -m "feat: add TranscriptPanel with search, language toggle, and word tooltips"
```

---

### Task 27: CompanionPanel Component

**Files:**

- Create: `frontend/src/components/lesson/CompanionPanel.tsx`

- [ ] **Step 1: Implement CompanionPanel**

Create `frontend/src/components/lesson/CompanionPanel.tsx`:

```typescript
import { useState, useRef, useEffect } from "react";
import type { Segment } from "../../types";

interface CompanionPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSend: (content: string) => void;
  activeSegment: Segment | null;
  model: string;
  onModelChange: (model: string) => void;
}

export default function CompanionPanel({
  messages,
  isStreaming,
  onSend,
  activeSegment,
  model,
  onModelChange,
}: CompanionPanelProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, messages[messages.length - 1]?.content]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    onSend(input.trim());
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Header */}
      <div className="p-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">AI Companion</h3>
        <input
          type="text"
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs text-slate-300 w-48 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Model..."
        />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 text-sm mt-8">
            <p>Ask me about grammar, vocabulary, or the current segment.</p>
            <p className="text-xs mt-1">I can explain patterns, break down sentences, and more.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-200 border border-slate-700"
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}

        {isStreaming && (
          <div className="flex justify-start">
            <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Context pill + Input */}
      <div className="p-3 bg-slate-800 border-t border-slate-700">
        {activeSegment && (
          <div className="mb-2 px-2 py-1 bg-slate-700 rounded text-xs text-slate-400 inline-block">
            Context: [{formatTime(activeSegment.start)}] {activeSegment.chinese.slice(0, 30)}
            {activeSegment.chinese.length > 30 ? "..." : ""}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about grammar, vocabulary..."
            rows={1}
            className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white text-sm rounded-md transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/lesson/CompanionPanel.tsx
git commit -m "feat: add AI Companion chat panel with streaming and context pill"
```

---

### Task 28: LessonView (3-Panel Layout)

**Files:**

- Create: `frontend/src/components/lesson/LessonView.tsx`

- [ ] **Step 1: Implement LessonView**

Create `frontend/src/components/lesson/LessonView.tsx`:

```typescript
import { useCallback, useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { usePlayer } from "../../contexts/PlayerContext";
import { useLesson } from "../../hooks/useLesson";
import { useActiveSegment } from "../../hooks/useActiveSegment";
import { useChat } from "../../hooks/useChat";
import { saveLessonMeta, getVideo, getSettings } from "../../db";
import VideoPanel from "./VideoPanel";
import TranscriptPanel from "./TranscriptPanel";
import CompanionPanel from "./CompanionPanel";
import type { Segment } from "../../types";

export default function LessonView() {
  const { id } = useParams<{ id: string }>();
  const { db, keys } = useAuth();
  const { player, currentTime } = usePlayer();
  const { meta, segments, loading, error } = useLesson(db, id);
  const activeSegment = useActiveSegment(segments, currentTime);
  const [videoBlob, setVideoBlob] = useState<Blob | undefined>();
  const [model, setModel] = useState("openai/gpt-4o-mini");

  const { messages, isStreaming, sendMessage } = useChat(
    db,
    id,
    meta?.title || "",
    activeSegment,
    segments,
    keys,
    model
  );

  // Load video blob for uploaded lessons
  useEffect(() => {
    if (db && id && meta?.source === "upload") {
      getVideo(db, id).then((blob) => {
        if (blob) setVideoBlob(blob);
      });
    }
  }, [db, id, meta?.source]);

  // Load default model from settings
  useEffect(() => {
    if (db) {
      getSettings(db).then((s) => {
        if (s?.defaultModel) setModel(s.defaultModel);
      });
    }
  }, [db]);

  const handleSegmentClick = useCallback(
    (segment: Segment) => {
      if (player) {
        player.seekTo(segment.start);
        player.play();
      }
    },
    [player]
  );

  const handleProgressUpdate = useCallback(
    (segmentId: string) => {
      if (db && meta) {
        saveLessonMeta(db, { ...meta, progressSegmentId: segmentId });
      }
    },
    [db, meta]
  );

  if (loading) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400">Loading lesson...</div>
      </div>
    );
  }

  if (error || !meta) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error || "Lesson not found"}</p>
          <Link to="/" className="text-blue-400 hover:text-blue-300">
            Back to Library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-slate-900">
      {/* Left: Video (36%) */}
      <div className="w-[36%] border-r border-slate-700">
        <VideoPanel
          lesson={meta}
          segments={segments}
          activeSegment={activeSegment}
          videoBlob={videoBlob}
        />
      </div>

      {/* Middle: Transcript (34%) */}
      <div className="w-[34%] border-r border-slate-700">
        <TranscriptPanel
          segments={segments}
          activeSegment={activeSegment}
          lesson={meta}
          onSegmentClick={handleSegmentClick}
          onProgressUpdate={handleProgressUpdate}
        />
      </div>

      {/* Right: AI Companion (30%) */}
      <div className="flex-1">
        <CompanionPanel
          messages={messages}
          isStreaming={isStreaming}
          onSend={sendMessage}
          activeSegment={activeSegment}
          model={model}
          onModelChange={setModel}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/lesson/LessonView.tsx
git commit -m "feat: add LessonView 3-panel layout connecting video, transcript, and companion"
```

---

### Task 29: Wire LessonView into Routes

**Files:**

- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Replace the Lesson placeholder**

Update `frontend/src/App.tsx` to import and use `LessonView`:

```typescript
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { PlayerProvider } from "./contexts/PlayerContext";
import Setup from "./components/onboarding/Setup";
import Unlock from "./components/onboarding/Unlock";
import Library from "./components/library/Library";
import CreateLesson from "./components/create/CreateLesson";
import LessonView from "./components/lesson/LessonView";
import Settings from "./components/settings/Settings";

function AuthGate() {
  const { isFirstSetup, isUnlocked } = useAuth();

  if (isFirstSetup === null) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  if (isFirstSetup) return <Setup />;
  if (!isUnlocked) return <Unlock />;

  return (
    <PlayerProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/create" element={<CreateLesson />} />
          <Route path="/lesson/:id" element={<LessonView />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </BrowserRouter>
    </PlayerProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
```

- [ ] **Step 2: Run frontend build to catch type errors**

Run: `cd frontend && npx tsc --noEmit` Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire LessonView into routes — all screens complete"
```

---

## Chunk 6: Docker Deployment

### Task 30: Backend Dockerfile

**Files:**

- Create: `backend/Dockerfile`

- [ ] **Step 1: Create Backend Dockerfile**

Create `backend/Dockerfile`:

```dockerfile
FROM python:3.12-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY app/ app/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Commit**

```bash
git add backend/Dockerfile
git commit -m "feat: add backend Dockerfile with ffmpeg and yt-dlp"
```

---

### Task 31: Frontend Dockerfile

**Files:**

- Create: `frontend/Dockerfile`

- [ ] **Step 1: Create Frontend Dockerfile**

Create `frontend/Dockerfile`:

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 2: Commit**

```bash
git add frontend/Dockerfile
git commit -m "feat: add frontend multi-stage Dockerfile"
```

---

### Task 32: Docker Compose + Nginx

**Files:**

- Create: `docker-compose.yml`
- Create: `nginx.conf`

- [ ] **Step 1: Create nginx.conf**

Create `nginx.conf`:

```nginx
server {
    listen 80;
    server_name _;

    location /api/ {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
        proxy_buffering off;
        client_max_body_size 2g;
    }

    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 2: Create docker-compose.yml**

Create `docker-compose.yml`:

```yaml
services:
  backend:
    build: ./backend
    restart: unless-stopped
    expose:
      - '8000'

  frontend:
    build: ./frontend
    restart: unless-stopped
    ports:
      - '80:80'
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - backend
```

- [ ] **Step 3: Test docker-compose config**

Run: `docker-compose config` Expected: Valid YAML output with no errors

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml nginx.conf
git commit -m "feat: add Docker Compose setup with nginx reverse proxy"
```

---

### Task 33: Final Integration Test

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && python -m pytest -v` Expected: All tests PASS

- [ ] **Step 2: Run all frontend tests**

Run: `cd frontend && npx vitest run` Expected: All tests PASS

- [ ] **Step 3: Run frontend lint**

Run: `cd frontend && npm run lint` Expected: No errors (or fix with
`npm run lint:fix`)

- [ ] **Step 4: Run frontend type check**

Run: `cd frontend && npx tsc --noEmit` Expected: No errors

- [ ] **Step 5: Build frontend**

Run: `cd frontend && npm run build` Expected: Build succeeds with output in
`dist/`

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add backend/ frontend/ docker-compose.yml nginx.conf
git commit -m "fix: resolve integration issues from final testing"
```
