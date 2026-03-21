"""Audio extraction service for YouTube videos and uploaded files."""

import asyncio
import logging
import time
import uuid
from pathlib import Path

import ffmpeg
import yt_dlp

from app.config import settings

logger = logging.getLogger(__name__)


_TEMP_DIR = Path("/tmp/shadowlearn")


def _ensure_temp_dir() -> Path:
    _TEMP_DIR.mkdir(parents=True, exist_ok=True)
    return _TEMP_DIR


_VIDEO_EXTS = {".mp4", ".mkv", ".webm"}


def _ydl_extra_opts() -> dict:
    """Return optional yt-dlp opts for cookies, proxy, and/or BGUtil PO tokens."""
    opts: dict = {}
    path = settings.ytdlp_cookies_file
    if path and Path(path).is_file():
        opts["cookiefile"] = path
    if settings.ytdlp_proxy:
        opts["proxy"] = settings.ytdlp_proxy
    if settings.ytdlp_bgutil_url:
        opts["extractor_args"] = {
            "youtubepot-bgutilhttp": {
                "base_url": [settings.ytdlp_bgutil_url],
            },
        }
    return opts


def _download_youtube_video(video_id: str, file_uuid: str, temp_dir: Path) -> Path:
    """Blocking: download video+audio from YouTube using yt-dlp.

    Uses %(ext)s in outtmpl so yt-dlp chooses the container; discovers the
    output file by globbing for the UUID to handle non-mp4 fallbacks.
    """
    url = f"https://www.youtube.com/watch?v={video_id}"
    ydl_opts = {
        "format": "bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4][height<=720]/best",
        "outtmpl": str(temp_dir / f"{file_uuid}.%(ext)s"),
        "merge_output_format": "mp4",
        "quiet": True,
        "no_warnings": True,
        **_ydl_extra_opts(),
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
    try:
        size_mb = result.stat().st_size / 1024 / 1024
    except OSError:
        size_mb = -1.0
    logger.info(
        "[pipeline] download_youtube_video: done in %.1fs → %s (%.1f MB)",
        time.monotonic() - t0, result.name, size_mb,
    )
    return result


def _extract_audio_ffmpeg(video_path: Path, output_path: Path) -> None:
    """Blocking: extract audio from a video file using ffmpeg."""
    file_size_mb = video_path.stat().st_size / 1024 / 1024
    logger.debug("ffmpeg starting: input=%s (%.1f MB) → output=%s", video_path.name, file_size_mb, output_path.name)
    t0 = time.monotonic()

    stdout, stderr = (
        ffmpeg
        .input(str(video_path))
        .output(str(output_path), acodec="libmp3lame", audio_bitrate="192k")
        .overwrite_output()
        .run(capture_stdout=True, capture_stderr=True)
    )

    elapsed = time.monotonic() - t0
    logger.debug("ffmpeg completed in %.1fs", elapsed)
    if stderr:
        logger.debug("ffmpeg stderr: %s", stderr.decode(errors="replace")[-500:])


def _get_youtube_duration_blocking(video_id: str) -> float:
    """Blocking: get duration of a YouTube video via yt-dlp metadata."""
    url = f"https://www.youtube.com/watch?v={video_id}"
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        **_ydl_extra_opts(),
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False, process=False)
        return float(info.get("duration", 0))


async def extract_audio_from_upload(video_path: Path) -> Path:
    """Extract audio from an uploaded video file, returning the path to the mp3 file."""
    file_size_mb = video_path.stat().st_size / 1024 / 1024
    logger.info("[pipeline] extract_audio_from_upload: start file=%s (%.1f MB)", video_path.name, file_size_mb)
    temp_dir = _ensure_temp_dir()
    output_path = temp_dir / f"{uuid.uuid4()}.mp3"
    t0 = time.monotonic()
    await asyncio.to_thread(_extract_audio_ffmpeg, video_path, output_path)
    elapsed = time.monotonic() - t0
    if not output_path.exists():
        logger.error("[pipeline] extract_audio_from_upload: no output produced for %s", video_path)
        raise FileNotFoundError(f"Audio extraction produced no output for {video_path}")
    logger.info(
        "[pipeline] extract_audio_from_upload: done in %.1fs → %s (%.1f MB)",
        elapsed, output_path.name, output_path.stat().st_size / 1024 / 1024,
    )
    return output_path


async def get_youtube_duration(video_id: str) -> float:
    """Return the duration in seconds of a YouTube video."""
    logger.info("[pipeline] get_youtube_duration: start video_id=%s", video_id)
    t0 = time.monotonic()
    duration = await asyncio.to_thread(_get_youtube_duration_blocking, video_id)
    logger.info("[pipeline] get_youtube_duration: %.1fs duration, fetched in %.1fs", duration, time.monotonic() - t0)
    return duration


async def probe_upload_duration(video_path: Path) -> float:
    """Return the duration in seconds of an uploaded video file."""
    logger.info("[pipeline] probe_upload_duration: start file=%s", video_path.name)
    def _probe() -> float:
        probe = ffmpeg.probe(str(video_path))
        format_info = probe.get("format", {})
        duration = format_info.get("duration")
        if duration is not None:
            return float(duration)
        # Fall back to stream duration
        for stream in probe.get("streams", []):
            if "duration" in stream:
                return float(stream["duration"])
        return 0.0

    duration = await asyncio.to_thread(_probe)
    logger.info("[pipeline] probe_upload_duration: %.1fs", duration)
    return duration
