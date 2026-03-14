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

Triggered when the user clicks "Generate Lesson". Maximum supported video duration: **2 hours** (ElevenLabs Scribe limit). Maximum uploaded file size: **2 GB**. These limits are validated on the frontend before any processing begins; the user sees a clear error if exceeded.

```
1. Input received (YouTube URL or uploaded video file)
      ↓
2. Validation
   - YouTube: URL format check; yt-dlp probes metadata for duration
   - Upload: file size ≤ 2 GB, duration ≤ 2 hours, accepted formats (mp4, mkv, webm, mov)
   - If invalid: return error immediately with a human-readable message
      ↓
3. Audio extraction (always, for both sources)
   - YouTube: yt-dlp downloads audio-only stream → mp3 file
   - Upload: ffmpeg extracts audio track → mp3 file
   - Result: a single mp3 file passed to STT regardless of source
   - Temp mp3 files are deleted from the server immediately after the response is returned
      ↓
4. Speech-to-Text — ElevenLabs Scribe
   - Input: mp3 audio file
   - Returns: segments [{text, start_time, end_time}, ...]
   - Word-level timestamps used for precise click-to-play
   - On failure: surface ElevenLabs error message to user; allow retry
      ↓
5. Pinyin generation — pypinyin (Python, offline, deterministic)
   - No API cost, instant, high accuracy for standard Mandarin
      ↓
6. Translation + word breakdown — OpenRouter API
   - Long videos are batched: segments grouped into chunks of ≤ 30 segments per call
   - Each chunk: LLM returns translations keyed by ISO 639-1 code + word list [{word, pinyin, meaning, usage}]
   - If a chunk response is malformed or truncated: retry up to 2 times; on persistent failure,
     mark affected segments with a "translation unavailable" flag and continue
   - User's preferred language for translation (e.g. English, Vietnamese)
      ↓
7. Lesson JSON assembled and returned to frontend
   - Frontend saves to IndexedDB
   - User is redirected to the lesson view
```

### Error Handling in the Pipeline

Each step failure surfaces a specific, actionable error in the Create Lesson UI:

| Failure | Message shown | Recovery action |
|---------|--------------|-----------------|
| YouTube unreachable / private video | "Could not access this YouTube video. Check the URL or try again." | Edit URL / Retry |
| File too large / too long | "File exceeds the 2 GB / 2-hour limit." | Upload a shorter clip |
| ElevenLabs API error | "Transcription failed: [ElevenLabs error]. Check your API key in Settings." | Fix key / Retry |
| OpenRouter API error | "Translation failed: [OpenRouter error]. Check your API key in Settings." | Fix key / Retry |
| Partial translation failure | "Some segments could not be translated. You can still use the lesson." | Continue / Retry failed |

---

## Data Models

### Lesson Segment

```json
{
  "id": "seg_001",
  "start": 1.2,
  "end": 3.8,
  "chinese": "今天是星期四，我第一天来这个学校上学。",
  "pinyin": "jīntiān shì xīngqī sì, wǒ dì yī tiān lái zhè gè xuéxiào shàngxué.",
  "translations": {
    "en": "Today is Thursday, my first day at this school.",
    "vi": "Hôm nay là thứ Năm, ngày đầu tiên tôi đến trường này."
  },
  "words": [
    {
      "word": "今天",
      "pinyin": "jīntiān",
      "meaning": "today",
      "usage": "Used for the current calendar day. 今天几号？ = What date is today?"
    },
    {
      "word": "学校",
      "pinyin": "xuéxiào",
      "meaning": "school",
      "usage": "General word for any school. 去学校 = go to school."
    }
  ]
}
```

### Lesson Metadata

```json
{
  "id": "lesson_abc123",
  "title": "上学的第一天",
  "source": "youtube",
  "sourceUrl": "https://youtube.com/watch?v=...",
  "duration": 312,
  "segmentCount": 23,
  "translationLanguages": ["en", "vi"],
  "createdAt": "2026-03-14T10:00:00Z",
  "lastOpenedAt": "2026-03-14T12:00:00Z",
  "progressSegmentId": "seg_007",
  "tags": ["HSK2", "School"]
}
```

Progress (`progressSegmentId`) is updated automatically whenever the user opens a lesson and each time they click a segment. It is not a manual action.

---

## Storage (IndexedDB)

### Stores

| Store | Key | Contents |
|-------|-----|----------|
| `lessons` | `lesson.id` | Lesson metadata objects |
| `segments` | `lesson.id` | Full segment array for that lesson |
| `videos` | `lesson.id` | Uploaded video file blob (YouTube lessons store nothing here) |
| `chats` | `lesson.id` | Array of chat messages for the lesson's AI companion |
| `settings` | `"settings"` | Plain JSON: translation language, default model |
| `crypto` | `"keys"` | Encrypted API key blob + PBKDF2 salt |

### Uploaded Video Storage

Uploaded video files are stored as binary blobs in the `videos` IndexedDB store. This allows the user to reopen an uploaded lesson without re-uploading the file. Storage footprint depends on video length; a 30-minute video at typical web quality is ~200–500 MB. No automatic cleanup is done — the user deletes lessons manually from the Library.

For YouTube lessons, the video file is never downloaded to the browser; the YouTube IFrame API streams it on demand.

### Chat History Persistence

AI companion chat history is persisted to the `chats` store, keyed by `lesson.id`. When a user reopens a lesson, their previous conversation is restored. The in-memory context window sent to OpenRouter always includes the last 20 messages to avoid exceeding model limits.

---

## Security: API Key Encryption

Keys are encrypted at rest using the browser's Web Crypto API:

1. **First setup:** User sets a PIN → PBKDF2 (100,000 iterations, SHA-256) derives an AES-GCM key from the PIN + a random 16-byte salt → API keys encrypted → encrypted blob + salt stored in the `crypto` IndexedDB store.
2. **Each session start:** User enters PIN on an unlock screen → same derivation → keys decrypted into a React context (in-memory) → available for the session.
3. **On page refresh:** The in-memory keys are lost. The user must re-enter their PIN. This is intentional: keys are never stored decrypted.
4. **PIN forgotten:** User clicks "Forgot PIN" → confirmation dialog warns that existing encrypted keys will be erased → they re-enter API keys and set a new PIN.

Non-sensitive settings (translation language, model preference) are stored as plain JSON in `settings`.

### New User Onboarding

On first launch (empty IndexedDB), the app shows a Setup screen before anything else:
1. Welcome message + brief explanation of what keys are needed and why
2. ElevenLabs API key input
3. OpenRouter API key input
4. PIN setup (enter + confirm)
5. "Save & Get Started" → encrypts and stores keys → navigates to Library

Until setup is complete, no other screen is accessible.

---

## Video–Transcript Sync

The core mechanic that makes the transcript interactive.

### VideoPlayer Interface

Both YouTube and HTML5 video sources are wrapped in a common `VideoPlayer` interface:

```typescript
interface VideoPlayer {
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  getCurrentTime(): number;        // poll or read synchronously
  getDuration(): number;
  setPlaybackRate(rate: number): void;
  onTimeUpdate(callback: (currentTime: number) => void): void;
  onEnded(callback: () => void): void;
  destroy(): void;
}
```

`YouTubePlayer` implements this by wrapping the IFrame Player API. `HTML5VideoPlayer` implements it by wrapping the `<video>` element. The Transcript and Companion components only ever interact with `VideoPlayer`.

### Sync Behaviour

- **Click to play segment:** `player.seekTo(segment.start); player.play()`
- **Auto-highlight during playback:** `onTimeUpdate` fires continuously. Find the segment where `segment.start ≤ currentTime < segment.end`. Set it as active and scroll it into view.
- **Gap between segments** (silence, music, no speech): When `currentTime` does not fall within any segment's range, the most recently active segment stays highlighted. No segment is un-highlighted mid-lesson.
- **Prev/Next segment buttons:** Jump to `prevSegment.start` or `nextSegment.start`.

---

## Frontend Screens

### 1. Library (Home)
- Grid of lesson cards: thumbnail area, title, duration, segment count, progress bar
- "+ Add new lesson" dashed card as the first item
- Search bar to filter lessons by title
- Sort options: recent / alphabetical / progress
- Top nav: logo, search, "+ New Lesson" button, settings icon

### 2. Create Lesson
- Tab switcher: **YouTube URL** / **Upload Video**
- YouTube tab: URL input field
- Upload tab: drag-and-drop zone (accepts mp4, mkv, webm, mov); shows file size and duration after selection
- Per-lesson settings: translation language, AI model
- "Generate Lesson" button → shows live processing steps with status icons (pending / active / done / error)
- On completion: auto-navigate to lesson view
- On step failure: show error message inline with a Retry button for that step

### 3. Lesson View (3-panel, full screen)

**Left panel — Video (36% width)**
- Video player (YouTube IFrame or HTML5 `<video>` depending on source)
- Custom controls: play/pause, prev/next segment jump, playback speed (0.5×, 0.75×, 1×, 1.25×, 1.5×)
- Progress bar with scrubber
- Time display (current / total)
- Video metadata below player: title, duration, segment count, tags

**Middle panel — Transcript (34% width)**
- Search bar (filters visible segments by Chinese text or translation)
- Scrollable segment list — each segment shows:
  - Pinyin (small, muted)
  - Chinese characters (large)
  - Translation (small, muted)
  - Timestamp (visible on hover)
- **Click segment** → seek video + play
- **Active segment** → left blue border + darker background; auto-scrolls into view
- **Hover word** → tooltip showing: character(s), pinyin, meaning, usage note (from `words[].usage`)
- **Translation language toggle** in panel header: switches the displayed translation language. Each segment stores translations as a map keyed by ISO 639-1 language code (e.g. `"en"`, `"vi"`) — see Data Models. The toggle is display-only — it reads from the already-fetched map in IndexedDB and does not trigger a new API call. Only language codes generated at lesson-creation time are available in the toggle.

**Right panel — AI Companion (remaining width)**
- Chat history (restored from IndexedDB on open)
- AI context: system prompt includes video title, current active segment, and a sliding window of the last 40 segments from the transcript (to stay within token limits for long videos)
- Grammar responses include structured cards: pattern → example sentences (Chinese + pinyin + translation)
- Model selector in panel header (OpenRouter models)
- Context pill above input: shows current active segment timestamp
- Textarea input + send button
- Chat history persists in IndexedDB per lesson

### 4. Settings
Sidebar navigation with sections:

**API Keys**
- ElevenLabs API key (masked, Edit button)
- OpenRouter API key (masked, Edit button)
- PIN: change PIN button; "Forgot PIN" link (warns that keys will be erased)
- Encryption status banner: explains keys are AES-256 encrypted, never leave the device

**Language**
- Default translation language (dropdown; values are ISO 639-1 codes, displayed as human-readable names e.g. "English (en)")

**AI Model**
- Default OpenRouter model for new lessons

**Appearance**
- Theme: Slate Dark (default); light mode is out of scope for now

---

## Tech Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React + Vite | UI framework |
| State | React Context + hooks | App-wide state (active lesson, player, keys) |
| Storage | IndexedDB (idb library) | Lessons, segments, videos, chats, settings, crypto |
| Crypto | Web Crypto API (AES-GCM, PBKDF2) | API key encryption |
| Video (YouTube) | YouTube IFrame Player API | Playback, seek, timeupdate |
| Video (upload) | HTML5 `<video>` element | Playback, seek, timeupdate |
| Backend | Python + FastAPI | Stateless processing API |
| Audio extraction | yt-dlp | YouTube audio download |
| Audio extraction | ffmpeg (ffmpeg-python) | Uploaded video → mp3 |
| STT | ElevenLabs Scribe | Transcription + timestamps |
| Pinyin | pypinyin | Pinyin generation (offline, free) |
| Translation + AI | OpenRouter API | Translation (batched), companion chat |
| Self-hosting | docker-compose + nginx | One-command deployment |

---

## What's Out of Scope (for now)

- User accounts / authentication
- Cloud storage or syncing across devices
- Support for non-YouTube platforms (Bilibili, Douyin)
- Offline mode (Service Worker caching)
- Vocabulary flashcard or SRS system
- Mobile layout optimization
- Light mode theme
