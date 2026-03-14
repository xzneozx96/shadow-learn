# ShadowLearn — Chinese Shadowing Companion
**Design Spec · 2026-03-14**

---

## Overview

ShadowLearn is a personal web app for learning Mandarin Chinese using the shadowing method. The user feeds it a YouTube video or uploaded video file, and the app generates an interactive lesson: a synchronized transcript with pinyin and translation, word-level hover explanations, and an AI companion for grammar/vocabulary Q&A — all tied to the video's playback timeline.

**Audience:** Personal use first; designed to be self-hosted and shared freely with friends. BYOK (bring your own API keys). No accounts, no billing, completely free.

---

## Architecture

### Deployment Model

Two separate services, with a `docker-compose.yml` for easy self-hosting:

| Service | Stack | Port |
|---------|-------|------|
| Frontend | React + Vite | 5173 (dev) / 80 (prod) |
| Backend | Python + FastAPI | 8000 |

Vite proxies `/api/*` to FastAPI in development, eliminating CORS issues. In production, a reverse proxy (nginx in docker-compose) handles routing.

### Backend is stateless

The FastAPI backend is a pure processing API — it holds no state and writes nothing to disk. All lesson data lives in the user's browser (IndexedDB). This keeps self-hosting trivial: no database setup, no migrations.

---

## Processing Pipeline

Triggered when the user clicks "Generate Lesson":

```
1. Input received (YouTube URL or uploaded video file)
      ↓
2. Audio extraction
   - YouTube: yt-dlp downloads audio-only stream (mp3)
   - Upload: ffmpeg extracts audio track from video file
      ↓
3. Speech-to-Text — ElevenLabs Scribe
   - Accepts audio (and video directly for uploads)
   - Returns segments: [{text, start_time, end_time}, ...]
   - Word-level timestamps used for precise click-to-play
      ↓
4. Pinyin generation — pypinyin (Python, offline, deterministic)
   - No API cost, instant, high accuracy for standard Mandarin
      ↓
5. Translation + word breakdown — OpenRouter API
   - Single LLM call per lesson: Chinese segments → translations + word list
   - Word list: [{word, pinyin, meaning}] per segment
   - User's preferred language for translation (e.g. English, Vietnamese)
      ↓
6. Lesson JSON returned to frontend
   - Frontend saves to IndexedDB
   - User is redirected to the lesson view
```

### Lesson Segment Data Model

```json
{
  "id": "seg_001",
  "start": 1.2,
  "end": 3.8,
  "chinese": "今天是星期四，我第一天来这个学校上学。",
  "pinyin": "jīntiān shì xīngqī sì, wǒ dì yī tiān lái zhè gè xuéxiào shàngxué.",
  "translation": "Today is Thursday, my first day at this school.",
  "words": [
    { "word": "今天", "pinyin": "jīntiān", "meaning": "today" },
    { "word": "星期四", "pinyin": "xīngqī sì", "meaning": "Thursday" },
    { "word": "学校", "pinyin": "xuéxiào", "meaning": "school" },
    { "word": "上学", "pinyin": "shàngxué", "meaning": "to attend school" }
  ]
}
```

### Lesson Metadata Model

```json
{
  "id": "lesson_abc123",
  "title": "上学的第一天",
  "source": "youtube",
  "sourceUrl": "https://youtube.com/watch?v=...",
  "duration": 312,
  "segmentCount": 23,
  "translationLanguage": "English",
  "createdAt": "2026-03-14T10:00:00Z",
  "lastOpenedAt": "2026-03-14T12:00:00Z",
  "progressSegmentId": "seg_007",
  "tags": ["HSK2", "School"]
}
```

---

## Frontend

### Technology

- **React** (Vite) — component framework
- **YouTube IFrame Player API** — YouTube video embed with programmatic seek/play
- **HTML5 `<video>`** — for uploaded video files
- **IndexedDB** (via idb library) — local persistent storage
- **Web Crypto API** — AES-GCM encryption for API keys

### Screens

#### 1. Library (Home)
- Grid of lesson cards: thumbnail, title, duration, segment count, progress bar
- "+ Add new lesson" dashed card as first item
- Search bar to filter lessons by title
- Sort by: recent / alphabetical / progress
- Top nav: logo, search, "+ New Lesson" button, settings icon

#### 2. Create Lesson
- Tab switcher: **YouTube URL** / **Upload Video**
- YouTube tab: URL input field
- Upload tab: drag-and-drop zone (accepts mp4, mkv, webm, mov)
- Per-lesson settings: translation language, AI model
- "Generate Lesson" button → shows live processing steps:
  1. Fetching audio ✓
  2. Transcribing (ElevenLabs) ✓
  3. Generating pinyin & translations (active spinner)
  4. Building lesson (pending)
- On completion: auto-navigate to lesson view

#### 3. Lesson View (3-panel, full screen)

**Left panel — Video (36% width)**
- Video player (YouTube IFrame or HTML5 `<video>`)
- Custom controls: play/pause, prev/next segment jump, playback speed (0.5×, 0.75×, 1×, 1.25×, 1.5×)
- Progress bar with scrubber
- Time display (current / total)
- Video metadata: title, duration, segment count, tags

**Middle panel — Transcript (34% width)**
- Transcript search bar
- Scrollable segment list — each segment shows:
  - Pinyin (small, muted)
  - Chinese characters (large)
  - Translation (small, muted)
  - Timestamp (visible on hover)
- **Click segment** → `videoPlayer.seekTo(segment.start)` + play
- **Active segment** → highlighted with left blue border + darker background; auto-scrolls into view
- Auto-highlight driven by `timeupdate` event: find segment where `start ≤ currentTime ≤ end`
- **Hover word** → tooltip showing: character(s), pinyin, meaning, usage note
- Translation language toggle in panel header

**Right panel — AI Companion (remaining width)**
- Chat interface: AI and user messages
- AI is context-aware: knows the current video title, current segment, and full lesson transcript
- Grammar responses include structured cards: pattern, example sentences (Chinese + pinyin + translation)
- Model selector in panel header (uses OpenRouter)
- Context pill above input: shows which segment is currently active
- Textarea input + send button

#### 4. Settings
Sidebar navigation with sections:

**API Keys**
- ElevenLabs API key (masked, Edit button)
- OpenRouter API key (masked, Edit button)
- PIN management: set, change, verify
- Encryption status banner: explains keys are AES-256 encrypted locally

**Language**
- Default translation language (dropdown)

**AI Model**
- Default OpenRouter model for new lessons

**Appearance**
- Theme toggle (Slate Dark default; light mode future)

---

## Security: API Key Encryption

Keys are encrypted at rest using the browser's Web Crypto API:

1. **First setup:** User sets a PIN → PBKDF2 derives an AES-GCM key from the PIN + a random salt → API keys encrypted → encrypted blob + salt stored in IndexedDB.
2. **Each session:** User enters PIN → same derivation → keys decrypted in memory → available for the session → cleared when tab closes.
3. **The PIN is never stored.** If forgotten, the user re-enters their API keys and sets a new PIN.

Non-sensitive settings (language, model preference) are stored as plain JSON in IndexedDB.

---

## Video–Transcript Sync

The core mechanic that makes the transcript interactive:

- **Click to play segment:** `videoPlayer.seekTo(segment.start); videoPlayer.play()`
- **Auto-highlight during playback:** `timeupdate` event fires ~4× per second. Find the segment where `segment.start ≤ currentTime < segment.end`, set it as active, auto-scroll it into view.
- **Prev/Next segment buttons:** Jump `currentTime` to `prev.start` or `next.start`.
- **YouTube:** Uses IFrame Player API (`YT.Player`, `seekTo`, `playVideo`, `getCurrentTime`)
- **Uploaded video:** Uses HTML5 `<video>` element (`currentTime`, `play()`, `timeupdate`)

Both players are abstracted behind a common `VideoPlayer` interface so the transcript and companion components don't care about the source.

---

## AI Companion: Context Design

Each chat message to OpenRouter includes:

```
System: You are a Mandarin Chinese language tutor helping a student learn from a video lesson.

Lesson: "上学的第一天"
Current segment (1:24): 今天是星期四，我第一天来这个学校上学。
Translation: Today is Thursday, my first day at this school.

Full transcript: [all segments as context]

Answer questions about vocabulary, grammar, pronunciation, and usage.
Format grammar explanations with: pattern → examples (Chinese + pinyin + English).
Translation language: English.
```

This gives the AI full lesson context, making answers specific to what the user is watching.

---

## Tech Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React + Vite | UI |
| State | React Context + hooks | App state |
| Storage | IndexedDB (idb) | Lessons, settings |
| Crypto | Web Crypto API | Key encryption |
| Video (YouTube) | YouTube IFrame API | Playback |
| Video (upload) | HTML5 `<video>` | Playback |
| Backend | Python + FastAPI | Processing API |
| Audio extraction | yt-dlp | YouTube audio |
| Audio extraction | ffmpeg (ffmpeg-python) | Uploaded video audio |
| STT | ElevenLabs Scribe | Transcription + timestamps |
| Pinyin | pypinyin | Pinyin generation (offline) |
| Translation + AI | OpenRouter API | Translation, companion chat |
| Dev tooling | docker-compose | Self-hosting |

---

## What's Out of Scope (for now)

- User accounts / authentication
- Cloud storage or syncing across devices
- Support for non-YouTube platforms (Bilibili, Douyin)
- Offline mode
- Vocabulary flashcard system (could be a future phase)
- Mobile layout optimization
