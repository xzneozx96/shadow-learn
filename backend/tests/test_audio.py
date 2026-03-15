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
