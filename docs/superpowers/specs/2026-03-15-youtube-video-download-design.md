# YouTube Video Download Design

**Date:** 2026-03-15
**Status:** Approved

## Problem

YouTube lessons currently download audio-only (MP3) for transcription and playback. The `VideoPanel` shows a static YouTube thumbnail + "Open on YouTube" link with a hidden `<audio>` element. This provides no native video playback or sync control.

## Goal

Download the full YouTube video (MP4) and store it in IndexedDB, so the lesson player renders a native `<video>` element — the same experience as uploaded video lessons.

## Constraints

- Max video duration: 15 minutes (down from 2 hours) — applies to both YouTube and uploads
- Failure handling: same as today — yt-dlp errors bubble up as job errors, shown as error badge in library
- Video stored in IndexedDB as blob (same as uploaded videos)
- Video file deleted from backend temp storage after frontend downloads it

## Approach

1. Backend downloads MP4 via yt-dlp
2. Backend extracts audio from the MP4 via ffmpeg (reuses existing `extract_audio_from_upload`)
3. Audio used for Deepgram transcription, then deleted
4. MP4 served to frontend via new endpoint, then deleted
5. Frontend saves MP4 blob to IndexedDB
6. `VideoPanel` renders `<video>` element when blob is a video type

This is backward-compatible: existing YouTube lessons with an audio blob (or no blob) continue to use the thumbnail + audio mode.

## Backend Changes

### `backend/app/services/audio.py`

Add two functions. The `outtmpl` uses a UUID base with `%(ext)s` so yt-dlp writes the actual extension — the returned path is discovered by globbing for the UUID, making it robust to container fallbacks:

```python
def _download_youtube_video(video_id: str, file_uuid: str, temp_dir: Path) -> Path:
    """Blocking: download video+audio from YouTube as MP4 using yt-dlp.
    Returns the actual output path (extension may vary by availability)."""
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
    # Discover actual output file (extension determined by yt-dlp).
    # Filter to known video extensions to avoid matching .part or .ytdl sidecars.
    _VIDEO_EXTS = {".mp4", ".mkv", ".webm"}
    matches = [p for p in temp_dir.glob(f"{file_uuid}.*") if p.suffix in _VIDEO_EXTS]
    if not matches:
        raise FileNotFoundError(f"Video download produced no output for video_id={video_id}")
    return matches[0]

async def download_youtube_video(video_id: str) -> Path:
    """Download a YouTube video, returning the path to the output file."""
    temp_dir = _ensure_temp_dir()
    file_uuid = str(uuid.uuid4())
    return await asyncio.to_thread(_download_youtube_video, video_id, file_uuid, temp_dir)
```

### `backend/app/config.py`

```python
max_video_duration_seconds: int = 900  # was 7200 (2h), now 15 min
```

This applies to both YouTube and upload pipelines (both call this setting). Both `_process_youtube_lesson` and `_process_upload_lesson` duration error messages must use minutes: `f"Video exceeds the {max_mins:.0f}-minute duration limit."` — the upload pipeline currently divides by 3600 (hours) which would display as "0-hour limit" after this config change.

### `backend/app/routers/lessons.py`

**Import change** — swap `extract_audio_from_youtube` for `download_youtube_video`; retain all others:

```python
from app.services.audio import (
    download_youtube_video,      # replaces extract_audio_from_youtube
    extract_audio_from_upload,   # retained — now also used in YouTube pipeline
    get_youtube_duration,
    probe_upload_duration,
)
```

**`_shared_pipeline`** — rename parameter and result key. The parameter is named `media_filename` (not `video_filename`) to avoid confusion, since upload lessons could also pass a value here in the future. The result key changes from `audio_url` to `video_url`:

```python
async def _shared_pipeline(
    ...
    media_filename: str | None = None,  # was audio_filename
) -> None:
    ...
    if media_filename:
        result["video_url"] = f"/api/lessons/video/{media_filename}"
```

`_process_upload_lesson` does **not** pass `media_filename` (it calls `_shared_pipeline` without the kwarg today, and that does not change). Its duration error message must also be updated to use minutes (see config note above).

**Dead code after this change:** `extract_audio_from_youtube` in `audio.py` and the `GET /api/lessons/audio/{filename}` endpoint in `lessons.py` become unused. Both should be removed in the same PR.

**`_process_youtube_lesson`** — full revised pipeline:

```python
async def _process_youtube_lesson(request, video_id, job_id):
    video_path: Path | None = None   # must be initialised before try block
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
        # Audio no longer needed — delete immediately
        audio_path.unlink(missing_ok=True)
        audio_path = None

        await _shared_pipeline(
            job_id, segments, ..., media_filename=video_path.name
        )
    except Exception as exc:
        logger.exception("YouTube lesson pipeline failed: %s", exc)
        jobs[job_id].status = "error"
        jobs[job_id].error = str(exc)
    finally:
        if audio_path and audio_path.exists():
            audio_path.unlink(missing_ok=True)
        # Delete video only on failure; on success the serve endpoint deletes it after streaming
        if video_path and video_path.exists() and jobs[job_id].status != "complete":
            video_path.unlink(missing_ok=True)
```

**Known gap:** if the job succeeds but the frontend never fetches `video_url` (e.g. tab closed), the MP4 file remains in `/tmp/shadowlearn` indefinitely. This is the same gap that exists for the current audio file. A future TTL sweep could address both. Not in scope here.

**New endpoint:**

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

## Frontend Changes

### `frontend/src/hooks/useJobPoller.ts`

On job complete for YouTube lessons, destructure `video_url` instead of `audio_url`. Also update the comment on that line:

```ts
// job.result has the nested shape { lesson: {...}, video_url? } —
// matches the backend _shared_pipeline result dict.
const { lesson: resultLesson, video_url } = job.result
if (lesson.source === 'youtube' && video_url) {
  const videoBlob = await fetch(video_url).then(r => r.blob())
  await saveVideo(db, lesson.id, videoBlob)
}
```

### `frontend/src/components/lesson/VideoPanel.tsx`

Two changes:

1. `isAudioOnly` condition — check blob type for backward compatibility:
   ```ts
   const isAudioOnly = lesson.source === 'youtube' && (!videoBlob || videoBlob.type.startsWith('audio/'))
   ```

2. Download tooltip and file extension — check blob type instead of source. Note: `handleDownload` already guards `if (!videoBlob) return`, so no optional chaining needed:
   ```ts
   // tooltip
   {videoBlob?.type.startsWith('video/') ? 'Download video' : 'Download audio'}

   // handleDownload ext (videoBlob is non-null here due to early return guard)
   const ext = videoBlob.type.startsWith('video/') ? getMimeExtension(videoBlob.type) : '.mp3'
   ```

Upload lessons (`lesson.source === 'upload'`) are unaffected by both changes: `isAudioOnly` was already `false` for them, and the download ext change evaluates identically since their blobs are already `video/mp4`.

## Data Flow

```
POST /api/lessons/generate
  → _process_youtube_lesson (background)
    → get_youtube_duration()           [check ≤ 900s]
    → download_youtube_video()         → /tmp/shadowlearn/{uuid}.<ext>
    → extract_audio_from_upload()      → /tmp/shadowlearn/{uuid}.mp3
    → transcribe_audio_deepgram()
    → audio_path.unlink()              [MP3 deleted immediately after transcription]
    → _shared_pipeline()               [video_url in job result]
  ← job.status = "complete", job.result.video_url = "/api/lessons/video/{filename}"

useJobPoller polls → job complete
  → fetch(video_url) → MP4 blob        [MP4 streamed and deleted from backend]
  → saveVideo(db, lessonId, blob)      → IndexedDB

VideoPanel
  → getVideo(db, id) → MP4 blob
  → isAudioOnly = false                [blob.type = "video/mp4"]
  → renders <video> element
```

## Backward Compatibility

Existing YouTube lessons in IndexedDB have an MP3 audio blob (or no blob). The updated `isAudioOnly` check handles all cases:

| `videoBlob`            | `isAudioOnly` | Renders               |
|------------------------|---------------|-----------------------|
| `undefined`            | `true`        | thumbnail + audio (unchanged) |
| `audio/mpeg` (old MP3) | `true`        | thumbnail + audio (unchanged) |
| `video/mp4` (new)      | `false`       | native `<video>` (new) |

## Out of Scope

- Retry logic for yt-dlp failures
- Progress reporting during video download
- Serving video via HTTP range requests
- TTL/cleanup sweep for orphaned temp files
