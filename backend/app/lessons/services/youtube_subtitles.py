"""YouTube manual-transcript path: skip STT when high-quality human captions exist."""

import asyncio
import html
import logging
import re
import uuid
from pathlib import Path

import yt_dlp

from app.lessons.services.audio import _ydl_extra_opts
from app.transcription.services.transcription_provider import _Segment, _WordTiming

logger = logging.getLogger(__name__)

_TEMP_DIR = Path("/tmp/shadowlearn")


_TIMESTAMP_RE = re.compile(
    r"(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})"
)
_TAG_RE = re.compile(r"<[^>]+>")


def _ts_to_seconds(h: str, m: str, s: str, ms: str) -> float:
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0


def _clean_cue_text(raw: str) -> str:
    no_tags = _TAG_RE.sub("", raw)
    decoded = html.unescape(no_tags)
    decoded = decoded.replace("\xa0", " ")
    return " ".join(decoded.split())


def _is_rolling_continuation(prev_text: str, curr_text: str) -> bool:
    """YouTube rolling captions: each cue contains the previous one as a prefix."""
    if not prev_text:
        return False
    return curr_text.startswith(prev_text) and curr_text != prev_text


def _is_cjk_lang(source_language: str) -> bool:
    return source_language.startswith("zh") or source_language.startswith("ja")


def _synthesize_word_timings(
    text: str, start: float, end: float, source_language: str
) -> list[_WordTiming]:
    """Approximate per-word timings for line-level YouTube cues.

    CJK: per-char even split (whitespace skipped).
    Other languages: whitespace tokens, duration weighted by char length.
    Ensures each WordTiming.text is a substring of `text` so the frontend
    buildPositionMap (segment-text.ts) can locate it.
    """
    if not text or not text.strip():
        return []

    duration = max(0.0, end - start)

    if _is_cjk_lang(source_language):
        chars = [c for c in text if not c.isspace()]
        if not chars:
            return []
        slice_dur = duration / len(chars) if duration > 0 else 0.0
        result: list[_WordTiming] = []
        for i, ch in enumerate(chars):
            wt_start = start + i * slice_dur
            wt_end = start + (i + 1) * slice_dur if i < len(chars) - 1 else end
            result.append({"text": ch, "start": wt_start, "end": wt_end})
        return result

    tokens = text.split()
    if not tokens:
        return []
    total_chars = sum(len(t) for t in tokens)
    if total_chars == 0:
        return []
    per_char = duration / total_chars if duration > 0 else 0.0
    result = []
    cursor = start
    for i, tok in enumerate(tokens):
        tok_dur = per_char * len(tok)
        tok_end = cursor + tok_dur if i < len(tokens) - 1 else end
        result.append({"text": tok, "start": cursor, "end": tok_end})
        cursor = tok_end
    return result


LANG_MAP: dict[str, list[str]] = {
    "zh-CN": ["zh-Hans", "zh-CN", "zh"],
    "zh-TW": ["zh-Hant", "zh-TW"],
    "en": ["en", "en-US", "en-GB"],
    "ja": ["ja"],
    "ko": ["ko"],
    "vi": ["vi"],
}


def parse_vtt_to_segments(vtt: str, source_language: str) -> list[_Segment]:
    """Parse a WebVTT body into segment dicts matching the STT provider _Segment shape."""
    if not vtt:
        return []

    cjk = _is_cjk_lang(source_language)
    cues: list[tuple[float, float, str]] = []
    lines = vtt.splitlines()
    i = 0
    while i < len(lines):
        m = _TIMESTAMP_RE.search(lines[i])
        if not m:
            i += 1
            continue
        start = _ts_to_seconds(*m.group(1, 2, 3, 4))
        end = _ts_to_seconds(*m.group(5, 6, 7, 8))
        i += 1
        text_lines: list[str] = []
        while i < len(lines) and lines[i].strip():
            text_lines.append(lines[i])
            i += 1
        cleaned = _clean_cue_text(" ".join(text_lines))
        if cjk:
            cleaned = cleaned.replace(" ", "")
        if cleaned:
            cues.append((start, end, cleaned))

    # Merge rolling-caption duplicates: each new cue extends the previous text.
    merged: list[tuple[float, float, str]] = []
    for start, end, text in cues:
        if merged and _is_rolling_continuation(merged[-1][2], text):
            prev_start, _, _ = merged[-1]
            merged[-1] = (prev_start, end, text)
        else:
            merged.append((start, end, text))

    segments: list[_Segment] = []
    for idx, (start, end, text) in enumerate(merged):
        segments.append(
            {
                "id": idx,
                "start": start,
                "end": end,
                "text": text,
                "word_timings": _synthesize_word_timings(text, start, end, source_language),
            }
        )
    return segments


def _download_subtitle_blocking(video_id: str, yt_lang: str, work_dir: Path) -> None:
    """Blocking: invoke yt-dlp to write a single subtitle file into work_dir."""
    url = f"https://www.youtube.com/watch?v={video_id}"
    file_uuid = str(uuid.uuid4())
    ydl_opts = {
        "skip_download": True,
        "writesubtitles": True,
        "writeautomaticsub": False,
        "subtitleslangs": [yt_lang],
        "subtitlesformat": "vtt/best",
        "outtmpl": str(work_dir / f"{file_uuid}.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        **_ydl_extra_opts(),
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])


async def download_subtitle_vtt(video_id: str, yt_lang: str) -> str:
    """Download a single manual subtitle in VTT format and return its content."""
    _TEMP_DIR.mkdir(parents=True, exist_ok=True)
    before = set(_TEMP_DIR.glob("*.vtt"))
    await asyncio.to_thread(_download_subtitle_blocking, video_id, yt_lang, _TEMP_DIR)
    after = set(_TEMP_DIR.glob("*.vtt"))
    new_files = list(after - before)
    if not new_files:
        raise FileNotFoundError(
            f"yt-dlp produced no VTT subtitle for video_id={video_id} lang={yt_lang}"
        )
    path = new_files[0]
    try:
        return path.read_text(encoding="utf-8")
    finally:
        path.unlink(missing_ok=True)


def pick_manual_subtitle(subtitles: dict, source_language: str) -> str | None:
    """Return the first matching YouTube subtitle lang code for source_language, else None."""
    candidates = LANG_MAP.get(source_language, [])
    for code in candidates:
        if code in subtitles:
            return code
    return None
