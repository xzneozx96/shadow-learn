from pathlib import Path
from unittest.mock import patch

import pytest

from app.lessons.services.youtube_subtitles import (
    _synthesize_word_timings,
    download_subtitle_vtt,
    parse_vtt_to_segments,
    pick_manual_subtitle,
)


def test_pick_manual_subtitle_zh_cn_matches_zh_hans():
    """zh-CN source should pick the zh-Hans track when present."""
    subtitles = {"zh-Hans": [{"ext": "vtt"}], "en": [{"ext": "vtt"}]}
    assert pick_manual_subtitle(subtitles, "zh-CN") == "zh-Hans"


def test_pick_manual_subtitle_falls_through_alternatives():
    """zh-CN source should fall through to "zh" when zh-Hans/zh-CN absent."""
    subtitles = {"zh": [{"ext": "vtt"}]}
    assert pick_manual_subtitle(subtitles, "zh-CN") == "zh"


def test_pick_manual_subtitle_rejects_unmapped_lang():
    """Returns None when no candidate code is present in subtitles."""
    subtitles = {"en": [{"ext": "vtt"}]}
    assert pick_manual_subtitle(subtitles, "zh-CN") is None


def test_pick_manual_subtitle_strict_script_separation():
    """zh-TW source must NOT match zh-Hans (cross-script rejected)."""
    subtitles = {"zh-Hans": [{"ext": "vtt"}]}
    assert pick_manual_subtitle(subtitles, "zh-TW") is None


def test_pick_manual_subtitle_empty_dict():
    assert pick_manual_subtitle({}, "zh-CN") is None


def test_pick_manual_subtitle_unknown_source_language():
    """Source language not in LANG_MAP returns None gracefully."""
    subtitles = {"fr": [{"ext": "vtt"}]}
    assert pick_manual_subtitle(subtitles, "fr") is None


# --- _synthesize_word_timings ---


def test_synthesize_cjk_per_char_even_split():
    result = _synthesize_word_timings("你好世界", 10.0, 14.0, "zh-CN")
    assert len(result) == 4
    assert [w["text"] for w in result] == ["你", "好", "世", "界"]
    assert result[0]["start"] == 10.0
    assert result[3]["end"] == 14.0
    for i in range(len(result) - 1):
        assert result[i]["end"] == result[i + 1]["start"]
        assert result[i]["end"] > result[i]["start"]


def test_synthesize_latin_weighted_by_length():
    result = _synthesize_word_timings("hello world there", 0.0, 6.0, "en")
    assert [w["text"] for w in result] == ["hello", "world", "there"]
    assert result[0]["start"] == 0.0
    assert result[-1]["end"] == 6.0
    # equal char counts => equal slices (~2s each)
    for w in result:
        assert abs((w["end"] - w["start"]) - 2.0) < 1e-6


def test_synthesize_japanese_uses_cjk_branch():
    result = _synthesize_word_timings("こんにちは", 0.0, 5.0, "ja")
    assert len(result) == 5
    assert [w["text"] for w in result] == ["こ", "ん", "に", "ち", "は"]


def test_synthesize_korean_uses_whitespace_branch():
    result = _synthesize_word_timings("안녕 세계", 0.0, 2.0, "ko")
    assert [w["text"] for w in result] == ["안녕", "세계"]


def test_synthesize_empty_text_returns_empty_list():
    assert _synthesize_word_timings("", 0.0, 5.0, "zh-CN") == []


def test_synthesize_whitespace_only_returns_empty_list():
    assert _synthesize_word_timings("   \n\t ", 0.0, 5.0, "en") == []


def test_synthesize_cjk_skips_inner_whitespace():
    """CJK distribution ignores spaces (which would otherwise be treated as chars)."""
    result = _synthesize_word_timings("你 好", 0.0, 2.0, "zh-CN")
    assert [w["text"] for w in result] == ["你", "好"]
    assert result[0]["start"] == 0.0
    assert result[-1]["end"] == 2.0


def test_synthesize_substrings_match_original_text():
    """Every WordTiming.text must be a substring of input text — buildPositionMap contract."""
    text_zh = "今天天气很好"
    for wt in _synthesize_word_timings(text_zh, 0.0, 6.0, "zh-CN"):
        assert wt["text"] in text_zh
    text_en = "the quick brown fox"
    for wt in _synthesize_word_timings(text_en, 0.0, 4.0, "en"):
        assert wt["text"] in text_en


def test_synthesize_latin_weighted_unequal_lengths():
    """Tokens of unequal length get duration proportional to char count."""
    # "a" (1) + "bb" (2) + "ccc" (3) = 6 char-units over 6 seconds → 1s, 2s, 3s
    result = _synthesize_word_timings("a bb ccc", 0.0, 6.0, "en")
    assert [w["text"] for w in result] == ["a", "bb", "ccc"]
    assert abs((result[0]["end"] - result[0]["start"]) - 1.0) < 1e-6
    assert abs((result[1]["end"] - result[1]["start"]) - 2.0) < 1e-6
    assert abs((result[2]["end"] - result[2]["start"]) - 3.0) < 1e-6
    assert result[-1]["end"] == 6.0


def test_synthesize_zero_duration_does_not_crash():
    """Edge: start == end yields entries with zero-duration timings, no division-by-zero."""
    result = _synthesize_word_timings("你好", 5.0, 5.0, "zh-CN")
    assert len(result) == 2
    for w in result:
        assert w["start"] == 5.0
        assert w["end"] == 5.0


# --- parse_vtt_to_segments ---


_VTT_BASIC = """WEBVTT

00:00:01.000 --> 00:00:03.500
Hello world
"""


def test_parse_vtt_basic_cue():
    segs = parse_vtt_to_segments(_VTT_BASIC, "en")
    assert len(segs) == 1
    s = segs[0]
    assert s["id"] == 0
    assert s["start"] == 1.0
    assert s["end"] == 3.5
    assert s["text"] == "Hello world"
    assert len(s["word_timings"]) == 2


def test_parse_vtt_strips_styling_tags():
    vtt = """WEBVTT

00:00:00.000 --> 00:00:02.000
<c.colorE5E5E5>Hello</c><00:00:01.000><c> world</c>
"""
    segs = parse_vtt_to_segments(vtt, "en")
    assert segs[0]["text"] == "Hello world"


def test_parse_vtt_decodes_html_entities():
    vtt = """WEBVTT

00:00:00.000 --> 00:00:02.000
caf&eacute;&nbsp;ok
"""
    segs = parse_vtt_to_segments(vtt, "en")
    assert "café" in segs[0]["text"]
    assert "&" not in segs[0]["text"]


def test_parse_vtt_merges_rolling_caption_duplicates():
    """YouTube auto/manual rolling captions repeat the previous line as the cue grows.
    Consecutive cues whose text contains the previous text should merge into one segment."""
    vtt = """WEBVTT

00:00:01.000 --> 00:00:02.000
Hello

00:00:02.000 --> 00:00:04.000
Hello world
"""
    segs = parse_vtt_to_segments(vtt, "en")
    assert len(segs) == 1
    assert segs[0]["start"] == 1.0
    assert segs[0]["end"] == 4.0
    assert segs[0]["text"] == "Hello world"


def test_parse_vtt_zh_strips_inner_spaces():
    vtt = """WEBVTT

00:00:00.000 --> 00:00:02.000
你 好 世 界
"""
    segs = parse_vtt_to_segments(vtt, "zh-CN")
    assert segs[0]["text"] == "你好世界"


def test_parse_vtt_assigns_sequential_ids():
    vtt = """WEBVTT

00:00:01.000 --> 00:00:02.000
First

00:00:03.000 --> 00:00:04.000
Second

00:00:05.000 --> 00:00:06.000
Third
"""
    segs = parse_vtt_to_segments(vtt, "en")
    assert [s["id"] for s in segs] == [0, 1, 2]


def test_parse_vtt_empty_input_returns_empty_list():
    assert parse_vtt_to_segments("", "en") == []
    assert parse_vtt_to_segments("WEBVTT\n\n", "en") == []


def test_parse_vtt_multi_line_cue_joins():
    vtt = """WEBVTT

00:00:00.000 --> 00:00:02.000
line one
line two
"""
    segs = parse_vtt_to_segments(vtt, "en")
    assert segs[0]["text"] == "line one line two"


def test_parse_vtt_with_hours_timestamp():
    vtt = """WEBVTT

01:02:03.500 --> 01:02:05.000
deep into the video
"""
    segs = parse_vtt_to_segments(vtt, "en")
    assert segs[0]["start"] == 3723.5
    assert segs[0]["end"] == 3725.0


def test_parse_vtt_word_timings_populated_for_karaoke():
    """Every parsed cue must have word_timings (for SegmentText karaoke path)."""
    segs = parse_vtt_to_segments(_VTT_BASIC, "en")
    for s in segs:
        assert s["word_timings"]
        for wt in s["word_timings"]:
            assert wt["text"] in s["text"]


# --- download_subtitle_vtt ---


_FAKE_VTT = """WEBVTT

00:00:01.000 --> 00:00:02.000
hello
"""


@pytest.mark.asyncio
async def test_download_subtitle_vtt_returns_file_content(tmp_path):
    """yt-dlp writes a .vtt file, function reads, deletes, returns content."""
    captured: dict = {}

    async def fake_to_thread(fn, *args, **kwargs):
        video_id, yt_lang, work_dir = args
        captured["video_id"] = video_id
        captured["yt_lang"] = yt_lang
        produced = Path(work_dir) / f"sub.{yt_lang}.vtt"
        produced.write_text(_FAKE_VTT)

    with patch(
        "app.lessons.services.youtube_subtitles._TEMP_DIR", tmp_path
    ), patch(
        "app.lessons.services.youtube_subtitles.asyncio.to_thread", side_effect=fake_to_thread
    ):
        content = await download_subtitle_vtt("dQw4w9WgXcQ", "zh-Hans")

    assert content == _FAKE_VTT
    assert captured["video_id"] == "dQw4w9WgXcQ"
    assert captured["yt_lang"] == "zh-Hans"
    assert not list(tmp_path.glob("*.vtt"))


@pytest.mark.asyncio
async def test_download_subtitle_vtt_passes_correct_ydl_options(tmp_path):
    """Verify the ydl_opts dict passed into the blocking worker."""
    captured_opts: dict = {}

    def fake_blocking(video_id, yt_lang, work_dir):
        # In real impl, the blocking helper builds ydl_opts; here we patch
        # the YoutubeDL constructor to capture them.
        produced = Path(work_dir) / f"out.{yt_lang}.vtt"
        produced.write_text(_FAKE_VTT)

    class FakeYDL:
        def __init__(self, opts):
            captured_opts.update(opts)

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def download(self, urls):
            # mimic yt-dlp creating the file
            outtmpl = captured_opts["outtmpl"]
            base = outtmpl.replace("%(ext)s", "")
            lang = captured_opts["subtitleslangs"][0]
            Path(f"{base}{lang}.vtt").write_text(_FAKE_VTT)

    with patch(
        "app.lessons.services.youtube_subtitles._TEMP_DIR", tmp_path
    ), patch("app.lessons.services.youtube_subtitles.yt_dlp.YoutubeDL", FakeYDL), patch(
        "app.lessons.services.youtube_subtitles._ydl_extra_opts", return_value={}
    ):
        await download_subtitle_vtt("vid123", "zh-Hans")

    assert captured_opts["writesubtitles"] is True
    assert captured_opts["writeautomaticsub"] is False
    assert captured_opts["skip_download"] is True
    assert captured_opts["subtitleslangs"] == ["zh-Hans"]
    assert captured_opts["subtitlesformat"] == "vtt/best"


@pytest.mark.asyncio
async def test_download_subtitle_vtt_raises_when_no_file_produced(tmp_path):
    """If yt-dlp produces no .vtt file, raise so caller can fall back to STT."""

    async def fake_to_thread(fn, *args, **kwargs):
        return None

    with patch(
        "app.lessons.services.youtube_subtitles._TEMP_DIR", tmp_path
    ), patch(
        "app.lessons.services.youtube_subtitles.asyncio.to_thread", side_effect=fake_to_thread
    ):
        with pytest.raises(FileNotFoundError):
            await download_subtitle_vtt("vid123", "zh-Hans")


@pytest.mark.asyncio
async def test_download_subtitle_vtt_uses_extra_opts(tmp_path):
    """Cookie/proxy/bgutil opts from _ydl_extra_opts must flow into yt-dlp call."""
    captured_opts: dict = {}

    class FakeYDL:
        def __init__(self, opts):
            captured_opts.update(opts)

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def download(self, urls):
            outtmpl = captured_opts["outtmpl"]
            base = outtmpl.replace("%(ext)s", "")
            lang = captured_opts["subtitleslangs"][0]
            Path(f"{base}{lang}.vtt").write_text(_FAKE_VTT)

    extras = {"proxy": "http://proxy:8080", "cookiefile": "/tmp/cookies.txt"}
    with patch(
        "app.lessons.services.youtube_subtitles._TEMP_DIR", tmp_path
    ), patch("app.lessons.services.youtube_subtitles.yt_dlp.YoutubeDL", FakeYDL), patch(
        "app.lessons.services.youtube_subtitles._ydl_extra_opts", return_value=extras
    ):
        await download_subtitle_vtt("vid123", "en")

    assert captured_opts.get("proxy") == "http://proxy:8080"
    assert captured_opts.get("cookiefile") == "/tmp/cookies.txt"
