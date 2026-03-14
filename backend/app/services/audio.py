"""Audio extraction service for YouTube videos and uploaded files."""

import asyncio
import uuid
from pathlib import Path

import ffmpeg
import yt_dlp


_TEMP_DIR = Path("/tmp/shadowlearn")


def _ensure_temp_dir() -> Path:
    _TEMP_DIR.mkdir(parents=True, exist_ok=True)
    return _TEMP_DIR


def _download_youtube_audio(video_id: str, output_path: Path) -> None:
    """Blocking: download audio from YouTube using yt-dlp."""
    url = f"https://www.youtube.com/watch?v={video_id}"
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": str(output_path.with_suffix("")),
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
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])


def _extract_audio_ffmpeg(video_path: Path, output_path: Path) -> None:
    """Blocking: extract audio from a video file using ffmpeg."""
    (
        ffmpeg
        .input(str(video_path))
        .output(str(output_path), acodec="libmp3lame", audio_bitrate="192k")
        .overwrite_output()
        .run(quiet=True)
    )


def _get_youtube_duration_blocking(video_id: str) -> float:
    """Blocking: get duration of a YouTube video via yt-dlp metadata."""
    url = f"https://www.youtube.com/watch?v={video_id}"
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        return float(info.get("duration", 0))


async def extract_audio_from_youtube(video_id: str) -> Path:
    """Download audio from a YouTube video, returning the path to the mp3 file."""
    temp_dir = _ensure_temp_dir()
    output_path = temp_dir / f"{uuid.uuid4()}.mp3"
    await asyncio.to_thread(_download_youtube_audio, video_id, output_path)
    if not output_path.exists():
        raise FileNotFoundError(f"Audio extraction produced no output for video_id={video_id}")
    return output_path


async def extract_audio_from_upload(video_path: Path) -> Path:
    """Extract audio from an uploaded video file, returning the path to the mp3 file."""
    temp_dir = _ensure_temp_dir()
    output_path = temp_dir / f"{uuid.uuid4()}.mp3"
    await asyncio.to_thread(_extract_audio_ffmpeg, video_path, output_path)
    if not output_path.exists():
        raise FileNotFoundError(f"Audio extraction produced no output for {video_path}")
    return output_path


async def get_youtube_duration(video_id: str) -> float:
    """Return the duration in seconds of a YouTube video."""
    return await asyncio.to_thread(_get_youtube_duration_blocking, video_id)


async def probe_upload_duration(video_path: Path) -> float:
    """Return the duration in seconds of an uploaded video file."""
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

    return await asyncio.to_thread(_probe)
