import stat as stat_module
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.lessons.services.audio import _ydl_extra_opts, download_youtube_video, extract_audio_from_upload


def _mock_stat():
    s = MagicMock()
    s.st_size = 1024 * 1024  # 1 MB
    s.st_mode = stat_module.S_IFDIR | 0o755
    return s


@pytest.mark.asyncio
async def test_download_youtube_video_returns_path():
    """download_youtube_video returns the path produced by the blocking worker."""
    fake_video = Path("/tmp/shadowlearn/abc123.mp4")
    with patch("app.lessons.services.audio.asyncio.to_thread", return_value=fake_video) as mock_thread:
        result = await download_youtube_video("dQw4w9WgXcQ")
        assert result == fake_video
        mock_thread.assert_called_once()


@pytest.mark.asyncio
async def test_download_youtube_video_raises_on_failure():
    """download_youtube_video propagates exceptions from the blocking worker."""
    with patch("app.lessons.services.audio.asyncio.to_thread", side_effect=Exception("yt-dlp failed")):
        with pytest.raises(Exception, match="yt-dlp failed"):
            await download_youtube_video("bad_id")


@pytest.mark.asyncio
async def test_extract_audio_from_upload_calls_ffmpeg():
    with patch("app.lessons.services.audio.asyncio.to_thread") as mock_thread:
        mock_thread.return_value = None
        with patch("app.lessons.services.audio.Path.exists", return_value=True), \
             patch("app.lessons.services.audio.Path.stat", return_value=_mock_stat()):
            result = await extract_audio_from_upload(Path("/tmp/video.mp4"))
            assert result.suffix == ".mp3"
            mock_thread.assert_called_once()


# --- _ydl_extra_opts tests ---


def test_ydl_extra_opts_empty_when_no_config():
    """Returns only js_runtimes when no yt-dlp settings are configured."""
    with patch("app.lessons.services.audio.settings") as mock_settings:
        mock_settings.ytdlp_cookies_file = ""
        mock_settings.ytdlp_proxy = ""
        mock_settings.ytdlp_bgutil_url = ""
        assert _ydl_extra_opts() == {"js_runtimes": {"node": {}}}


def test_ydl_extra_opts_includes_cookies_when_file_exists(tmp_path):
    """Returns cookiefile when the file exists on disk."""
    cookie_file = tmp_path / "cookies.txt"
    cookie_file.write_text("# Netscape HTTP Cookie File\n")
    with patch("app.lessons.services.audio.settings") as mock_settings:
        mock_settings.ytdlp_cookies_file = str(cookie_file)
        mock_settings.ytdlp_proxy = ""
        mock_settings.ytdlp_bgutil_url = ""
        result = _ydl_extra_opts()
        assert result["cookiefile"] == str(cookie_file)


def test_ydl_extra_opts_skips_cookies_when_file_missing():
    """Skips cookiefile when path is set but file doesn't exist."""
    with patch("app.lessons.services.audio.settings") as mock_settings:
        mock_settings.ytdlp_cookies_file = "/nonexistent/cookies.txt"
        mock_settings.ytdlp_proxy = ""
        mock_settings.ytdlp_bgutil_url = ""
        assert _ydl_extra_opts() == {"js_runtimes": {"node": {}}}


def test_ydl_extra_opts_includes_proxy():
    """Returns proxy when configured."""
    with patch("app.lessons.services.audio.settings") as mock_settings:
        mock_settings.ytdlp_cookies_file = ""
        mock_settings.ytdlp_proxy = "http://proxy:8080"
        mock_settings.ytdlp_bgutil_url = ""
        result = _ydl_extra_opts()
        assert result == {"proxy": "http://proxy:8080", "js_runtimes": {"node": {}}}


def test_ydl_extra_opts_includes_bgutil_extractor_args():
    """Returns extractor_args for BGUtil PO token provider when configured."""
    with patch("app.lessons.services.audio.settings") as mock_settings:
        mock_settings.ytdlp_cookies_file = ""
        mock_settings.ytdlp_proxy = ""
        mock_settings.ytdlp_bgutil_url = "http://bgutil:4416"
        result = _ydl_extra_opts()
        assert result == {
            "extractor_args": {
                "youtubepot-bgutilhttp": {
                    "base_url": ["http://bgutil:4416"],
                },
            },
            "js_runtimes": {"node": {}},
        }


def test_ydl_extra_opts_combines_all(tmp_path):
    """Returns all options when cookies, proxy, and BGUtil are all configured."""
    cookie_file = tmp_path / "cookies.txt"
    cookie_file.write_text("# Netscape HTTP Cookie File\n")
    with patch("app.lessons.services.audio.settings") as mock_settings:
        mock_settings.ytdlp_cookies_file = str(cookie_file)
        mock_settings.ytdlp_proxy = "http://proxy:8080"
        mock_settings.ytdlp_bgutil_url = "http://bgutil:4416"
        result = _ydl_extra_opts()
        assert result["cookiefile"] == str(cookie_file)
        assert result["proxy"] == "http://proxy:8080"
        assert result["extractor_args"] == {
            "youtubepot-bgutilhttp": {
                "base_url": ["http://bgutil:4416"],
            },
        }
