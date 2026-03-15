import stat as stat_module
import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path
from app.services.audio import extract_audio_from_youtube, extract_audio_from_upload


def _mock_stat():
    s = MagicMock()
    s.st_size = 1024 * 1024  # 1 MB
    s.st_mode = stat_module.S_IFDIR | 0o755  # needed for Path.mkdir(exist_ok=True) in Python 3.12
    return s


@pytest.mark.asyncio
async def test_extract_audio_from_youtube_calls_ytdlp():
    with patch("app.services.audio.asyncio.to_thread") as mock_thread:
        mock_thread.return_value = None
        with patch("app.services.audio.Path.exists", return_value=True), \
             patch("app.services.audio.Path.stat", return_value=_mock_stat()):
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
        with patch("app.services.audio.Path.exists", return_value=True), \
             patch("app.services.audio.Path.stat", return_value=_mock_stat()):
            result = await extract_audio_from_upload(Path("/tmp/video.mp4"))
            assert result.suffix == ".mp3"
            mock_thread.assert_called_once()
