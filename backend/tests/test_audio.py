import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from pathlib import Path
from app.services.audio import extract_audio_from_youtube, extract_audio_from_upload


@pytest.mark.asyncio
async def test_extract_audio_from_youtube_calls_ytdlp():
    with patch("app.services.audio.asyncio.to_thread") as mock_thread:
        mock_thread.return_value = None
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
