# YouTube Video Download Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace audio-only YouTube downloads with full video (MP4) download so the lesson player renders a native `<video>` element instead of a static thumbnail.

**Architecture:** yt-dlp downloads a video file; ffmpeg extracts audio from it for Deepgram transcription (reusing existing `extract_audio_from_upload`); the video is served to the frontend via a new endpoint and saved to IndexedDB; `VideoPanel` detects the video blob type and shows `<video>` instead of the thumbnail+audio mode.

**Tech Stack:** Python / FastAPI / yt-dlp / ffmpeg-python / pytest (backend); TypeScript / React / Vitest / fake-indexeddb (frontend)

---

## Chunk 1: Backend

### Task 1: Update `audio.py` — add `download_youtube_video`, remove dead audio-only functions

**Files:**
- Modify: `backend/app/services/audio.py`
- Modify: `backend/tests/test_audio.py`

- [ ] **Step 1: Update `test_audio.py` — replace old tests, add new**

  Open `backend/tests/test_audio.py`. Replace the entire file with the following (the two `extract_audio_from_youtube` tests are removed; a test for `download_youtube_video` is added; the `extract_audio_from_upload` test is kept unchanged):

  ```python
  import stat as stat_module
  from pathlib import Path
  from unittest.mock import MagicMock, patch

  import pytest

  from app.services.audio import download_youtube_video, extract_audio_from_upload


  def _mock_stat():
      s = MagicMock()
      s.st_size = 1024 * 1024  # 1 MB
      s.st_mode = stat_module.S_IFDIR | 0o755
      return s


  @pytest.mark.asyncio
  async def test_download_youtube_video_returns_path():
      """download_youtube_video returns the path produced by the blocking worker."""
      fake_video = Path("/tmp/shadowlearn/abc123.mp4")
      with patch("app.services.audio.asyncio.to_thread", return_value=fake_video) as mock_thread:
          result = await download_youtube_video("dQw4w9WgXcQ")
          assert result == fake_video
          mock_thread.assert_called_once()


  @pytest.mark.asyncio
  async def test_download_youtube_video_raises_on_failure():
      """download_youtube_video propagates exceptions from the blocking worker."""
      with patch("app.services.audio.asyncio.to_thread", side_effect=Exception("yt-dlp failed")):
          with pytest.raises(Exception, match="yt-dlp failed"):
              await download_youtube_video("bad_id")


  @pytest.mark.asyncio
  async def test_extract_audio_from_upload_calls_ffmpeg():
      with patch("app.services.audio.asyncio.to_thread") as mock_thread:
          mock_thread.return_value = None
          with patch("app.services.audio.Path.exists", return_value=True), \
               patch("app.services.audio.Path.stat", return_value=_mock_stat()):
              result = await extract_audio_from_upload(Path("/tmp/video.mp4"))
              assert result.suffix == ".mp3"
              mock_thread.assert_called_once()
  ```

- [ ] **Step 2: Run tests to confirm failure**

  ```bash
  cd backend && pytest tests/test_audio.py -v
  ```

  Expected: `test_download_youtube_video_returns_path` and `test_download_youtube_video_raises_on_failure` **FAIL** with `ImportError: cannot import name 'download_youtube_video'`.

- [ ] **Step 3: Update `audio.py`**

  Open `backend/app/services/audio.py`. Make these changes:

  a) **Remove** the entire `_download_youtube_audio` function (lines 23–40).

  b) **Remove** the entire `extract_audio_from_youtube` async function (lines 76–91).

  c) **Add** the following two functions after `_ensure_temp_dir` (before `_extract_audio_ffmpeg`):

  ```python
  _VIDEO_EXTS = {".mp4", ".mkv", ".webm"}


  def _download_youtube_video(video_id: str, file_uuid: str, temp_dir: Path) -> Path:
      """Blocking: download video+audio from YouTube using yt-dlp.

      Uses %(ext)s in outtmpl so yt-dlp chooses the container; discovers the
      output file by globbing for the UUID to handle non-mp4 fallbacks.
      """
      url = f"https://www.youtube.com/watch?v={video_id}"
      ydl_opts = {
          "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
          "outtmpl": str(temp_dir / f"{file_uuid}.%(ext)s"),
          "merge_output_format": "mp4",
          "quiet": True,
          "no_warnings": True,
      }
      with yt_dlp.YoutubeDL(ydl_opts) as ydl:
          ydl.download([url])
      # Filter to known video extensions to avoid .part / .ytdl sidecars
      matches = [p for p in temp_dir.glob(f"{file_uuid}.*") if p.suffix in _VIDEO_EXTS]
      if not matches:
          raise FileNotFoundError(f"Video download produced no output for video_id={video_id}")
      return matches[0]


  async def download_youtube_video(video_id: str) -> Path:
      """Download a YouTube video, returning the path to the output file."""
      logger.info("[pipeline] download_youtube_video: start video_id=%s", video_id)
      temp_dir = _ensure_temp_dir()
      file_uuid = str(uuid.uuid4())
      t0 = time.monotonic()
      result = await asyncio.to_thread(_download_youtube_video, video_id, file_uuid, temp_dir)
      logger.info(
          "[pipeline] download_youtube_video: done in %.1fs → %s (%.1f MB)",
          time.monotonic() - t0, result.name, result.stat().st_size / 1024 / 1024,
      )
      return result
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  cd backend && pytest tests/test_audio.py -v
  ```

  Expected: all 3 tests **PASS**.

- [ ] **Step 5: Commit**

  ```bash
  cd backend && git add app/services/audio.py tests/test_audio.py
  git commit -m "feat: add download_youtube_video, remove audio-only YouTube download"
  ```

---

### Task 2: Update `config.py` — reduce max duration to 15 minutes

**Files:**
- Modify: `backend/app/config.py`

- [ ] **Step 1: Update `config.py`**

  Open `backend/app/config.py`. Change line 6:

  ```python
  max_video_duration_seconds: int = 900  # 15 minutes (was 7200)
  ```

- [ ] **Step 2: Run existing tests to confirm nothing breaks**

  ```bash
  cd backend && pytest tests/ -v
  ```

  Expected: all tests **PASS** (the config value is not asserted in tests, only used at runtime).

- [ ] **Step 3: Commit**

  ```bash
  cd backend && git add app/config.py
  git commit -m "config: lower max video duration to 15 minutes"
  ```

---

### Task 3: Update `lessons.py` — new YouTube pipeline, video endpoint, remove audio endpoint

**Files:**
- Modify: `backend/app/routers/lessons.py`
- Modify: `backend/tests/test_lessons_router.py`

- [ ] **Step 1: Add a test for the new `/api/lessons/video/{filename}` endpoint**

  Open `backend/tests/test_lessons_router.py`. Append the following test at the end of the file:

  ```python
  @pytest.mark.asyncio
  async def test_get_video_serves_and_deletes_file(tmp_path):
      """GET /api/lessons/video/{filename} streams the file and deletes it."""
      import app.routers.lessons as lessons_module

      video_file = tmp_path / "test.mp4"
      video_file.write_bytes(b"fake video content")

      original_temp_dir = lessons_module._TEMP_DIR
      lessons_module._TEMP_DIR = tmp_path
      try:
          transport = ASGITransport(app=app)
          async with AsyncClient(transport=transport, base_url="http://test") as client:
              response = await client.get("/api/lessons/video/test.mp4")
          assert response.status_code == 200
          assert response.content == b"fake video content"
          assert not video_file.exists()
      finally:
          lessons_module._TEMP_DIR = original_temp_dir


  @pytest.mark.asyncio
  async def test_get_video_returns_404_for_missing_file():
      """GET /api/lessons/video/{filename} returns 404 when file is not found."""
      transport = ASGITransport(app=app)
      async with AsyncClient(transport=transport, base_url="http://test") as client:
          response = await client.get("/api/lessons/video/nonexistent.mp4")
      assert response.status_code == 404
  ```

- [ ] **Step 2: Run new tests to confirm they fail**

  ```bash
  cd backend && pytest tests/test_lessons_router.py::test_get_video_serves_and_deletes_file tests/test_lessons_router.py::test_get_video_returns_404_for_missing_file -v
  ```

  Expected: both **FAIL** with 404 (endpoint does not exist yet).

- [ ] **Step 3: Update `lessons.py` — imports**

  Open `backend/app/routers/lessons.py`. Replace the audio import block (lines 17–22):

  ```python
  from app.services.audio import (
      download_youtube_video,
      extract_audio_from_upload,
      get_youtube_duration,
      probe_upload_duration,
  )
  ```

- [ ] **Step 4: Update `lessons.py` — `_shared_pipeline` parameter and result key**

  Find the `_shared_pipeline` function signature (line 35). The current last parameter is `audio_filename: str | None = None`. Make two changes:

  a) Rename the parameter **in the `def` line**: `audio_filename` → `media_filename`. The updated signature line looks like:

  ```python
  async def _shared_pipeline(
      job_id: str,
      segments: list[dict],
      translation_languages: list[str],
      api_key: str,
      model: str,
      title: str,
      source: str,
      source_url: str | None,
      duration: float,
      media_filename: str | None = None,   # was audio_filename
  ) -> None:
  ```

  b) Replace the result-assembly block near the end of the function body (currently `if audio_filename: result["audio_url"] = ...`):

  ```python
  result: dict = {
      "lesson": {
          "title": title,
          "source": source,
          "source_url": source_url,
          "duration": duration,
          "segments": lesson_segments,
          "translation_languages": translation_languages,
      }
  }
  if media_filename:
      result["video_url"] = f"/api/lessons/video/{media_filename}"
  ```

- [ ] **Step 5: Update `lessons.py` — rewrite `_process_youtube_lesson`**

  Replace the entire `_process_youtube_lesson` function with:

  ```python
  async def _process_youtube_lesson(
      request: LessonRequest,
      video_id: str,
      job_id: str,
  ) -> None:
      """Background task: validate duration → download video → extract audio →
      transcribe → shared pipeline."""
      video_path: Path | None = None
      audio_path: Path | None = None
      try:
          jobs[job_id].step = "duration_check"
          duration = await get_youtube_duration(video_id)
          if duration > settings.max_video_duration_seconds:
              max_mins = settings.max_video_duration_seconds / 60
              jobs[job_id].status = "error"
              jobs[job_id].error = f"Video exceeds the {max_mins:.0f}-minute duration limit."
              return

          jobs[job_id].step = "video_download"
          video_path = await download_youtube_video(video_id)

          jobs[job_id].step = "audio_extraction"
          audio_path = await extract_audio_from_upload(video_path)

          jobs[job_id].step = "transcription"
          if not request.deepgram_api_key:
              jobs[job_id].status = "error"
              jobs[job_id].error = "Deepgram API key is required for transcription."
              return
          segments = await transcribe_audio_deepgram(audio_path, request.deepgram_api_key)
          # Audio no longer needed after transcription
          audio_path.unlink(missing_ok=True)
          audio_path = None

          source_url = f"https://www.youtube.com/watch?v={video_id}"
          title = f"YouTube Video ({video_id})"

          await _shared_pipeline(
              job_id,
              segments,
              request.translation_languages,
              request.openai_api_key,
              request.model,
              title,
              "youtube",
              source_url,
              duration,
              media_filename=video_path.name if video_path else None,
          )

      except Exception as exc:
          logger.exception("YouTube lesson pipeline failed: %s", exc)
          jobs[job_id].status = "error"
          jobs[job_id].error = str(exc)
      finally:
          if audio_path and audio_path.exists():
              audio_path.unlink(missing_ok=True)
          # Delete video only on failure; on success the /video endpoint deletes it after streaming
          if video_path and video_path.exists() and jobs[job_id].status != "complete":
              video_path.unlink(missing_ok=True)
  ```

- [ ] **Step 6: Update `lessons.py` — fix upload pipeline duration message**

  In `_process_upload_lesson`, find the duration-exceeded block (currently uses `max_hours = ... / 3600`). Replace it:

  ```python
  if duration > settings.max_video_duration_seconds:
      max_mins = settings.max_video_duration_seconds / 60
      jobs[job_id].status = "error"
      jobs[job_id].error = f"Video exceeds the {max_mins:.0f}-minute duration limit."
      return
  ```

- [ ] **Step 7: Update `lessons.py` — add `/video/{filename}` endpoint, remove `/audio/{filename}` endpoint**

  a) **Remove** the entire `get_audio` endpoint (the `@router.get("/audio/{filename}")` function).

  b) **Add** the following endpoint in its place:

  ```python
  @router.get("/video/{filename}")
  async def get_video(filename: str) -> StreamingResponse:
      """Serve a temporary video file and delete it after sending."""
      safe_name = Path(filename).name
      video_path = _TEMP_DIR / safe_name

      if not video_path.exists() or not video_path.is_file():
          raise HTTPException(status_code=404, detail="Video file not found")

      def iterfile():
          with video_path.open("rb") as f:
              while chunk := f.read(1024 * 64):
                  yield chunk
          video_path.unlink(missing_ok=True)

      _VIDEO_MEDIA_TYPES = {"mp4": "video/mp4", "mkv": "video/x-matroska", "webm": "video/webm"}
      ext = safe_name.rsplit(".", 1)[-1] if "." in safe_name else ""
      media_type = _VIDEO_MEDIA_TYPES.get(ext, "video/mp4")

      return StreamingResponse(
          iterfile(),
          media_type=media_type,
          headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
      )
  ```

- [ ] **Step 8: Run all backend tests**

  ```bash
  cd backend && pytest tests/ -v
  ```

  Expected: all tests **PASS**.

- [ ] **Step 9: Commit**

  ```bash
  cd backend && git add app/routers/lessons.py tests/test_lessons_router.py
  git commit -m "feat: YouTube pipeline downloads video, serves via /api/lessons/video endpoint"
  ```

---

## Chunk 2: Frontend

### Task 4: Update `useJobPoller.ts` — handle `video_url` instead of `audio_url`

**Files:**
- Modify: `frontend/src/hooks/useJobPoller.ts`
- Modify: `frontend/tests/useJobPoller.test.ts`

- [ ] **Step 1: Update the existing `useJobPoller` test — rename `audio_url` → `video_url`**

  Open `frontend/tests/useJobPoller.test.ts`.

  Find the test `'saves segments, downloads audio, marks complete, calls DELETE on success'` (line 80). Make three changes:

  a) Rename the test description to `'saves segments, downloads video, marks complete, calls DELETE on success'`

  b) In the mock fetch response, replace `audio_url: '/api/lessons/audio/audio.mp3'` with `video_url: '/api/lessons/video/video.mp4'`

  c) Replace the mock blob line `.mockResolvedValueOnce({ blob: async () => new Blob(['audio'], { type: 'audio/mpeg' }) })` with `.mockResolvedValueOnce({ blob: async () => new Blob(['video'], { type: 'video/mp4' }) })`

  d) After the `waitFor` block, add an assertion that the video blob was persisted to IndexedDB. Import `getVideo` at the top of the file alongside `getSegments`:

  ```ts
  import { getSegments, getVideo, initDB } from '@/db'
  ```

  Then add after `expect(saved).toHaveLength(1)`:

  ```ts
  const storedBlob = await getVideo(db, 'lesson_1')
  expect(storedBlob).toBeDefined()
  expect(storedBlob!.type).toBe('video/mp4')
  ```

  The full updated test block looks like this:

  ```ts
  it('saves segments, downloads video, marks complete, calls DELETE on success', async () => {
    const db = (globalThis as any).__testDb
    const lesson = makeProcessingLesson()
    const segments = [{
      id: '1',
      start: 0,
      end: 5,
      chinese: '你好',
      pinyin: 'nǐ hǎo',
      translations: { en: 'Hello' },
      words: [],
    }]
    const updateLesson = vi.fn(async () => {})

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          status: 'complete',
          step: 'complete',
          result: {
            lesson: { title: 'YouTube Video (abc)', source: 'youtube', source_url: 'https://youtube.com/watch?v=abc', duration: 60, segments, translation_languages: ['en'] },
            video_url: '/api/lessons/video/video.mp4',
          },
          error: null,
        }),
      })
      .mockResolvedValueOnce({ blob: async () => new Blob(['video'], { type: 'video/mp4' }) })
      .mockResolvedValue({ status: 204 })

    vi.stubGlobal('fetch', mockFetch)
    renderHook(() => useJobPoller({ lessons: [lesson], db, updateLesson }))

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    await vi.waitFor(async () => {
      expect(updateLesson).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'complete', jobId: undefined, duration: 60, segmentCount: 1 }),
      )
    }, { timeout: 3000 })

    const saved = await getSegments(db, 'lesson_1')
    expect(saved).toHaveLength(1)
    const storedBlob = await getVideo(db, 'lesson_1')
    expect(storedBlob).toBeDefined()
    expect(storedBlob!.type).toBe('video/mp4')
    expect(mockFetch).toHaveBeenCalledWith('/api/jobs/job_abc', { method: 'DELETE' })
  })
  ```

- [ ] **Step 2: Run frontend tests to confirm failure**

  ```bash
  cd frontend && npx vitest run tests/useJobPoller.test.ts
  ```

  Expected: `saves segments, downloads video...` test **FAILS** because the hook still reads `audio_url`.

- [ ] **Step 3: Update `useJobPoller.ts`**

  Open `frontend/src/hooks/useJobPoller.ts`. Replace lines 61–68 (the comment, the destructure, the `saveSegments` call, and the `if (lesson.source === 'youtube')` blob-download block) with:

  ```ts
  // job.result has the nested shape { lesson: {...}, video_url? } —
  // matches the backend _shared_pipeline result dict.
  const { lesson: resultLesson, video_url } = job.result
  await saveSegments(db, lesson.id, resultLesson.segments)
  if (lesson.source === 'youtube' && video_url) {
    const videoBlob = await fetch(video_url).then(r => r.blob())
    await saveVideo(db, lesson.id, videoBlob)
  }
  ```

- [ ] **Step 4: Run frontend tests to confirm they pass**

  ```bash
  cd frontend && npx vitest run tests/useJobPoller.test.ts
  ```

  Expected: all 5 tests **PASS**.

- [ ] **Step 5: Commit**

  ```bash
  cd frontend && git add src/hooks/useJobPoller.ts tests/useJobPoller.test.ts
  git commit -m "feat: useJobPoller handles video_url from completed YouTube jobs"
  ```

---

### Task 5: Update `VideoPanel.tsx` — show `<video>` when blob is a video type

**Files:**
- Modify: `frontend/src/components/lesson/VideoPanel.tsx`
- Modify: `frontend/tests/VideoPanel.helpers.test.ts`

- [ ] **Step 1: Add `isAudioOnly` unit tests to `VideoPanel.helpers.test.ts`**

  Open `frontend/tests/VideoPanel.helpers.test.ts`. Append the following describe block at the end of the file:

  ```ts
  describe('isAudioOnly condition', () => {
    // Mirror the expression from VideoPanel: source === 'youtube' && (!blob || blob.type.startsWith('audio/'))
    function isAudioOnly(source: string, blob?: Blob): boolean {
      return source === 'youtube' && (!blob || blob.type.startsWith('audio/'))
    }

    it('is true for youtube with no blob', () => {
      expect(isAudioOnly('youtube')).toBe(true)
    })

    it('is true for youtube with an audio blob (old lesson)', () => {
      expect(isAudioOnly('youtube', new Blob([], { type: 'audio/mpeg' }))).toBe(true)
    })

    it('is false for youtube with a video blob (new lesson)', () => {
      expect(isAudioOnly('youtube', new Blob([], { type: 'video/mp4' }))).toBe(false)
    })

    it('is false for upload source regardless of blob', () => {
      expect(isAudioOnly('upload', new Blob([], { type: 'video/mp4' }))).toBe(false)
    })
  })
  ```

- [ ] **Step 2: Run helper tests to confirm new tests pass**

  ```bash
  cd frontend && npx vitest run tests/VideoPanel.helpers.test.ts
  ```

  Expected: all tests **PASS** (the new `isAudioOnly condition` tests use pure logic, no component needed).

- [ ] **Step 3: Update `VideoPanel.tsx` — `isAudioOnly` condition**

  Open `frontend/src/components/lesson/VideoPanel.tsx`. Find line 117:

  ```ts
  const isAudioOnly = lesson.source === 'youtube'
  ```

  Replace with:

  ```ts
  const isAudioOnly = lesson.source === 'youtube' && (!videoBlob || videoBlob.type.startsWith('audio/'))
  ```

- [ ] **Step 4: Update `VideoPanel.tsx` — download tooltip text**

  Find the tooltip content (line 259):

  ```tsx
  {lesson.source === 'youtube' ? 'Download audio' : 'Download video'}
  ```

  Replace with:

  ```tsx
  {videoBlob?.type.startsWith('video/') ? 'Download video' : 'Download audio'}
  ```

- [ ] **Step 5: Update `VideoPanel.tsx` — download file extension**

  Find `handleDownload` (around line 196):

  ```ts
  const ext = lesson.source === 'youtube' ? '.mp3' : getMimeExtension(videoBlob.type)
  ```

  Replace with:

  ```ts
  const ext = videoBlob.type.startsWith('video/') ? getMimeExtension(videoBlob.type) : '.mp3'
  ```

- [ ] **Step 6: Run all frontend tests**

  ```bash
  cd frontend && npx vitest run
  ```

  Expected: all tests **PASS**.

- [ ] **Step 7: Commit**

  ```bash
  cd frontend && git add src/components/lesson/VideoPanel.tsx tests/VideoPanel.helpers.test.ts
  git commit -m "feat: VideoPanel renders video element for YouTube lessons with video blob"
  ```

---

## Smoke Test

After both chunks are complete, do a manual end-to-end check:

- [ ] Start the backend: `cd backend && uvicorn app.main:app --reload`
- [ ] Start the frontend: `cd frontend && npm run dev`
- [ ] Submit a short YouTube URL (≤15 min) and wait for the lesson to process
- [ ] Open the lesson — confirm the `<video>` element plays the video (not the thumbnail)
- [ ] Confirm scrubber, speed, and volume controls work
- [ ] Submit a URL for a video > 15 min — confirm it shows an error badge in the library with a "minute" duration message
- [ ] Open an existing YouTube lesson (created before this change) — confirm it still shows the thumbnail + audio mode
