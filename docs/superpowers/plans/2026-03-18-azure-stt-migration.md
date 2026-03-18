# Azure STT Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Azure AI Speech as an alternative STT provider alongside Deepgram, selected by `SHADOWLEARN_STT_PROVIDER` env var, following the existing TTS provider pattern.

**Architecture:** Extract shared transcription types/helpers into `transcription_provider.py`, move Deepgram logic into `transcription_deepgram.py`, add `transcription_azure.py` with continuous recognition, wire both through a factory in `main.py` lifespan. Frontend fetches a new `/api/config` endpoint to determine which keys to send.

**Tech Stack:** Python/FastAPI (backend), azure-cognitiveservices-speech SDK, ffmpeg subprocess, React/TypeScript (frontend), vitest + Testing Library (frontend tests), pytest + httpx (backend tests).

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `backend/app/services/transcription_provider.py` | Protocol, shared types, shared helpers |
| Create | `backend/app/services/transcription_deepgram.py` | Deepgram provider (logic moved from `transcription.py`) |
| Create | `backend/app/services/transcription_azure.py` | Azure continuous recognition provider |
| Create | `backend/app/services/transcription_factory.py` | Factory: `get_stt_provider(settings)` |
| Delete | `backend/app/services/transcription.py` | Replaced by the above |
| Create | `backend/app/routers/config.py` | `GET /api/config` endpoint |
| Modify | `backend/app/config.py` | Add `stt_provider` field |
| Modify | `backend/app/models.py` | Add `azure_speech_key`, `azure_speech_region` to `LessonRequest` |
| Modify | `backend/app/main.py` | Wire STT provider in lifespan; register config router |
| Modify | `backend/app/routers/lessons.py` | Pass `stt_provider` to background tasks; add Azure Form fields |
| Rename | `backend/tests/test_transcription.py` → `test_transcription_deepgram.py` | Update imports |
| Create | `backend/tests/test_transcription_azure.py` | Azure provider unit tests |
| Create | `backend/tests/test_transcription_factory.py` | Factory unit tests |
| Create | `backend/tests/test_config_router.py` | `/api/config` endpoint test |
| Modify | `backend/tests/test_lessons_router.py` | Update for new signatures/form fields |
| Modify | `frontend/src/components/settings/Settings.tsx` | Migrate to `/api/config`; gate Deepgram field |
| Modify | `frontend/src/components/onboarding/Setup.tsx` | Migrate to `/api/config`; gate Deepgram field |
| Modify | `frontend/src/hooks/useTTS.ts` | Migrate to `/api/config` |
| Modify | `frontend/src/components/create/CreateLesson.tsx` | Fetch `sttProvider` at mount; send only relevant keys |
| Create | `frontend/tests/CreateLesson.stt.test.tsx` | Test STT key branching logic |

---

## Task 1: Create `transcription_provider.py` — shared types, helpers, Protocol

**Files:**
- Create: `backend/app/services/transcription_provider.py`

- [ ] **Step 1: Write the file** — move `_Word`, `_WordTiming`, `_Segment`, `_SENTENCE_ENDINGS`, `_CLAUSE_BREAKS`, `_GAP_THRESHOLD_SECONDS`, `_MAX_SEGMENT_CHARS`, `_finalize_segment`, `_group_words_into_segments`, plus the new `TranscriptionKeys` and `STTProvider` from `transcription.py`:

```python
"""Shared types, helpers, and Protocol for STT providers."""

from pathlib import Path
from typing import Protocol, TypedDict

_SENTENCE_ENDINGS = set("。！？.!?")
_CLAUSE_BREAKS = set("，,、；;：:")
_GAP_THRESHOLD_SECONDS = 1.5
_MAX_SEGMENT_CHARS = 40


class _Word(TypedDict):
    text: str
    start: float
    end: float


class _WordTiming(TypedDict):
    text: str
    start: float
    end: float


class _Segment(TypedDict):
    id: int
    start: float
    end: float
    text: str
    word_timings: list[_WordTiming]


class TranscriptionKeys(TypedDict, total=False):
    deepgram_api_key: str
    azure_speech_key: str
    azure_speech_region: str


class STTProvider(Protocol):
    async def transcribe(
        self, audio_path: Path, keys: TranscriptionKeys, language: str
    ) -> list[_Segment]:
        """Transcribe audio to segments with word-level timestamps.

        Args:
            audio_path: Path to the audio file (MP3 produced by audio.py).
            keys: Provider-specific credentials (only relevant keys need be present).
            language: BCP-47 language tag, e.g. 'zh-CN'.

        Returns:
            List of segments with id, start, end, text, word_timings.

        Raises:
            ValueError: If a required key is missing.
            RuntimeError: If the provider API returns an error.
        """
        ...


def _finalize_segment(words: list[_Word], index: int, language: str) -> _Segment:
    """Create a segment dict from a list of word dicts."""
    text = " ".join(w["text"] for w in words)
    if language.startswith("zh"):
        text = text.replace(" ", "")
    return {
        "id": index,
        "start": words[0]["start"],
        "end": words[-1]["end"],
        "text": text,
        "word_timings": list(words),
    }


def _group_words_into_segments(words: list[_Word], language: str) -> list[_Segment]:
    """Group a flat word list into sentence segments.

    Splits on sentence-ending punctuation or time gaps.
    Used as fallback when utterance data is absent.
    """
    segments: list[_Segment] = []
    current_words: list[_Word] = []
    segment_index = 0

    for word in words:
        text = word["text"]

        if not current_words:
            current_words.append(word)
        else:
            prev_end = current_words[-1]["end"]
            gap = word["start"] - prev_end

            if gap > _GAP_THRESHOLD_SECONDS:
                segments.append(_finalize_segment(current_words, segment_index, language))
                segment_index += 1
                current_words = [word]
            else:
                current_words.append(word)

        current_text = " ".join(w["text"] for w in current_words)
        if language.startswith("zh"):
            current_text = current_text.replace(" ", "")

        if text.rstrip() and text[-1] in _SENTENCE_ENDINGS:
            segments.append(_finalize_segment(current_words, segment_index, language))
            segment_index += 1
            current_words = []
        elif text.rstrip() and text[-1] in _CLAUSE_BREAKS and len(current_text) >= _MAX_SEGMENT_CHARS:
            segments.append(_finalize_segment(current_words, segment_index, language))
            segment_index += 1
            current_words = []
        elif len(current_text) >= int(_MAX_SEGMENT_CHARS * 1.5):
            segments.append(_finalize_segment(current_words, segment_index, language))
            segment_index += 1
            current_words = []

    if current_words:
        segments.append(_finalize_segment(current_words, segment_index, language))

    return segments
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/transcription_provider.py
git commit -m "feat(stt): add transcription_provider with shared types, helpers, and STTProvider Protocol"
```

---

## Task 2: Create `transcription_deepgram.py` — move Deepgram logic

**Files:**
- Create: `backend/app/services/transcription_deepgram.py`

- [ ] **Step 1: Write the file** — copy the Deepgram-specific logic from `transcription.py`, replacing local type definitions with imports from `transcription_provider.py`:

```python
"""Deepgram nova-2 STT provider."""

import asyncio
import logging
from pathlib import Path
from typing import TypedDict

import httpx

from app.services.transcription_provider import (
    TranscriptionKeys,
    _Segment,
    _Word,
    _WordTiming,
    _finalize_segment,
    _group_words_into_segments,
)

logger = logging.getLogger(__name__)

_DEEPGRAM_TRANSCRIPTION_URL = "https://api.deepgram.com/v1/listen"
_DEEPGRAM_PARAMS = {
    "diarize": "true",
    "punctuate": "true",
    "utterances": "true",
    "smart_format": "true",
    "model": "nova-2",
}


class _DeepgramWord(TypedDict):
    word: str
    start: float
    end: float
    confidence: float
    speaker: int
    speaker_confidence: float
    punctuated_word: str


class _DeepgramUtterance(TypedDict):
    start: float
    end: float
    transcript: str
    words: list[_DeepgramWord]
    speaker: int
    id: str
    channel: int
    confidence: float


class _DeepgramAlternative(TypedDict):
    transcript: str
    confidence: float
    words: list[_DeepgramWord]


class _DeepgramChannel(TypedDict):
    alternatives: list[_DeepgramAlternative]
    detected_language: str
    language_confidence: float


class _DeepgramResults(TypedDict):
    channels: list[_DeepgramChannel]
    utterances: list[_DeepgramUtterance]


class _DeepgramResponse(TypedDict):
    results: _DeepgramResults


def _normalize_deepgram_words(words: list[_DeepgramWord]) -> list[_Word]:
    return [
        {
            "text": w.get("punctuated_word") or w["word"],
            "start": w["start"],
            "end": w["end"],
        }
        for w in words
    ]


def _segments_from_utterances(utterances: list[_DeepgramUtterance], language: str) -> list[_Segment]:
    segments: list[_Segment] = []
    for i, utt in enumerate(utterances):
        text = utt["transcript"]
        if language.startswith("zh"):
            text = text.replace(" ", "")
        if not text:
            continue
        word_timings: list[_WordTiming] = [
            {
                "text": w.get("punctuated_word") or w["word"],
                "start": w["start"],
                "end": w["end"],
            }
            for w in utt.get("words", [])
        ]
        segments.append({
            "id": i,
            "start": utt["start"],
            "end": utt["end"],
            "text": text,
            "word_timings": word_timings,
        })
    return segments


async def transcribe_audio_deepgram(audio_path: Path, api_key: str, language: str) -> list[_Segment]:
    """Transcribe audio using Deepgram nova-2. Used internally by DeepgramSTTProvider."""
    file_size = audio_path.stat().st_size
    logger.info("Transcribing %s (%.1f MB) with Deepgram nova-2", audio_path.name, file_size / 1024 / 1024)

    if file_size == 0:
        raise ValueError(f"Audio file is empty (0 bytes): {audio_path.name}")

    suffix = audio_path.suffix.lower().lstrip(".")
    _MIME_MAP = {"mp3": "audio/mpeg", "mp4": "audio/mp4", "m4a": "audio/mp4", "wav": "audio/wav", "ogg": "audio/ogg"}
    content_type = _MIME_MAP.get(suffix, f"audio/{suffix}") if suffix else "audio/mpeg"

    audio_bytes = await asyncio.to_thread(audio_path.read_bytes)
    params = {**_DEEPGRAM_PARAMS, "language": language}

    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.post(
            _DEEPGRAM_TRANSCRIPTION_URL,
            params=params,
            headers={
                "Authorization": f"Token {api_key}",
                "Content-Type": content_type,
                "Content-Length": str(file_size),
            },
            content=audio_bytes,
        )

    if response.status_code != 200:
        logger.error("Deepgram API error %d: %s", response.status_code, response.text[:500])
    response.raise_for_status()

    data: _DeepgramResponse = response.json()
    results = data.get("results", {})  # type: ignore[union-attr]

    utterances: list[_DeepgramUtterance] = results.get("utterances", [])  # type: ignore[assignment]
    if utterances:
        segments = _segments_from_utterances(utterances, language)
        logger.info("Deepgram transcription complete: %d segments from utterances", len(segments))
        return segments

    channels = results.get("channels", [])  # type: ignore[call-overload]
    if not channels:
        logger.warning("Deepgram returned no channels — empty transcript")
        return []

    channel = channels[0]
    detected_language = channel.get("detected_language", "unknown")
    language_confidence = channel.get("language_confidence", 0.0)
    logger.info("Deepgram detected language: %s (confidence=%.2f)", detected_language, language_confidence)

    alternative = channel.get("alternatives", [{}])[0]  # type: ignore[call-overload]
    raw_words: list[_DeepgramWord] = alternative.get("words", [])  # type: ignore[assignment]
    if not raw_words:
        logger.warning("Deepgram returned no speech")
        return []

    words = _normalize_deepgram_words(raw_words)
    return _group_words_into_segments(words, language)


class DeepgramSTTProvider:
    """STTProvider implementation backed by Deepgram nova-2."""

    async def transcribe(self, audio_path: Path, keys: TranscriptionKeys, language: str) -> list[_Segment]:
        api_key = keys.get("deepgram_api_key", "")
        if not api_key:
            raise ValueError("Deepgram API key is required when stt_provider=deepgram")
        return await transcribe_audio_deepgram(audio_path, api_key, language)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/transcription_deepgram.py
git commit -m "feat(stt): add transcription_deepgram.py with DeepgramSTTProvider"
```

---

## Task 3: Update tests — rename and fix imports

**Files:**
- Rename: `backend/tests/test_transcription.py` → `backend/tests/test_transcription_deepgram.py`

- [ ] **Step 1: Rename the test file**

```bash
git mv backend/tests/test_transcription.py backend/tests/test_transcription_deepgram.py
```

- [ ] **Step 2: Update imports at the top of the file** — replace:

```python
from app.services.transcription import (
    _finalize_segment,
    _group_words_into_segments,
    _segments_from_utterances,
    transcribe_audio_deepgram,
    _normalize_deepgram_words,
)
```

with:

```python
from app.services.transcription_provider import (
    _finalize_segment,
    _group_words_into_segments,
)
from app.services.transcription_deepgram import (
    _segments_from_utterances,
    transcribe_audio_deepgram,
    _normalize_deepgram_words,
)
```

- [ ] **Step 3: Update patch paths** — find all `patch("app.services.transcription.httpx.AsyncClient")` and change to `patch("app.services.transcription_deepgram.httpx.AsyncClient")`.

- [ ] **Step 4: Run tests to verify they still pass**

```bash
cd backend && python -m pytest tests/test_transcription_deepgram.py -v
```

Expected: all tests PASS.

- [ ] **Step 5: Delete `transcription.py`**

```bash
git rm backend/app/services/transcription.py
```

- [ ] **Step 6: Commit**

```bash
git add backend/tests/test_transcription_deepgram.py
git commit -m "refactor(stt): rename test_transcription → test_transcription_deepgram, update imports, delete transcription.py"
```

---

## Task 4: Create `transcription_azure.py` — tests first

**Files:**
- Create: `backend/tests/test_transcription_azure.py`
- Create: `backend/app/services/transcription_azure.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_transcription_azure.py
import json
import subprocess
import threading
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.services.transcription_azure import AzureSTTProvider, _run_continuous_recognition


def _make_sdk_mocks(utterances: list[dict]):
    """Build a minimal azure.cognitiveservices.speech mock that fires events."""
    speechsdk = MagicMock()

    # CancellationReason.Error sentinel
    speechsdk.CancellationReason.Error = "Error"

    # OutputFormat
    speechsdk.OutputFormat.Detailed = "Detailed"

    # Track registered callbacks
    callbacks = {}

    def make_recognizer(*args, **kwargs):
        rec = MagicMock()
        rec._callbacks = {}

        def connect(event_name, cb):
            rec._callbacks[event_name] = cb

        rec.recognized.connect = lambda cb: connect("recognized", cb)
        rec.session_stopped.connect = lambda cb: connect("session_stopped", cb)
        rec.canceled.connect = lambda cb: connect("canceled", cb)

        done_event = threading.Event()

        def start_continuous():
            for utt in utterances:
                evt = MagicMock()
                evt.result.text = utt["text"]
                result_json = {
                    "NBest": [{
                        "Words": [
                            {"Word": w["word"], "Offset": w["offset"], "Duration": w["duration"]}
                            for w in utt.get("words", [])
                        ]
                    }]
                }
                evt.result.json = json.dumps(result_json)
                rec._callbacks.get("recognized", lambda e: None)(evt)
            # Fire session_stopped
            stop_evt = MagicMock()
            rec._callbacks.get("session_stopped", lambda e: None)(stop_evt)

        rec.start_continuous_recognition = start_continuous
        rec.stop_continuous_recognition = MagicMock()
        return rec

    speechsdk.SpeechConfig = MagicMock()
    speechsdk.AudioConfig = MagicMock()
    speechsdk.SpeechRecognizer = make_recognizer
    return speechsdk


def test_run_continuous_recognition_converts_ticks_to_seconds(tmp_path):
    """100ns offset ticks are correctly converted to seconds."""
    wav_path = tmp_path / "audio.wav"
    wav_path.write_bytes(b"fake wav")

    utterances = [{
        "text": "你好",
        "words": [
            {"word": "你", "offset": 10_000_000, "duration": 5_000_000},   # 1.0s start, 0.5s dur → end 1.5s
            {"word": "好", "offset": 20_000_000, "duration": 5_000_000},   # 2.0s start → end 2.5s
        ],
    }]

    sdk = _make_sdk_mocks(utterances)

    with patch("app.services.transcription_azure.speechsdk", sdk):
        segments = _run_continuous_recognition(wav_path, "fake-key", "eastus", "zh-CN")

    assert len(segments) == 1
    seg = segments[0]
    assert seg["text"] == "你好"
    assert seg["word_timings"][0]["text"] == "你"
    assert seg["word_timings"][0]["start"] == pytest.approx(1.0)
    assert seg["word_timings"][0]["end"] == pytest.approx(1.5)
    assert seg["word_timings"][1]["start"] == pytest.approx(2.0)
    assert seg["word_timings"][1]["end"] == pytest.approx(2.5)


def test_run_continuous_recognition_strips_chinese_spaces(tmp_path):
    """Chinese utterance text has spaces stripped."""
    wav_path = tmp_path / "audio.wav"
    wav_path.write_bytes(b"fake wav")

    utterances = [{"text": "你 好", "words": []}]
    sdk = _make_sdk_mocks(utterances)

    with patch("app.services.transcription_azure.speechsdk", sdk):
        segments = _run_continuous_recognition(wav_path, "fake-key", "eastus", "zh-CN")

    assert segments[0]["text"] == "你好"


def test_run_continuous_recognition_raises_on_cancellation(tmp_path):
    """RuntimeError raised when canceled with CancellationReason.Error."""
    wav_path = tmp_path / "audio.wav"
    wav_path.write_bytes(b"fake wav")

    speechsdk = MagicMock()
    speechsdk.CancellationReason.Error = "Error"
    speechsdk.OutputFormat.Detailed = "Detailed"

    def make_recognizer(*args, **kwargs):
        rec = MagicMock()
        callbacks = {}
        rec.recognized.connect = lambda cb: callbacks.update({"recognized": cb})
        rec.session_stopped.connect = lambda cb: callbacks.update({"session_stopped": cb})
        rec.canceled.connect = lambda cb: callbacks.update({"canceled": cb})

        def start_continuous():
            evt = MagicMock()
            evt.result.cancellation_details.reason = "Error"
            evt.result.cancellation_details.error_details = "Auth failed"
            callbacks.get("canceled", lambda e: None)(evt)

        rec.start_continuous_recognition = start_continuous
        rec.stop_continuous_recognition = MagicMock()
        return rec

    speechsdk.SpeechConfig = MagicMock()
    speechsdk.AudioConfig = MagicMock()
    speechsdk.SpeechRecognizer = make_recognizer

    with patch("app.services.transcription_azure.speechsdk", speechsdk):
        with pytest.raises(RuntimeError, match="Auth failed"):
            _run_continuous_recognition(wav_path, "fake-key", "eastus", "zh-CN")


@pytest.mark.asyncio
async def test_azure_stt_provider_raises_without_key(tmp_path):
    """ValueError raised when azure_speech_key is absent from keys."""
    provider = AzureSTTProvider()
    audio = tmp_path / "audio.mp3"
    audio.write_bytes(b"fake")

    with pytest.raises(ValueError, match="Azure Speech key"):
        await provider.transcribe(audio, {}, "zh-CN")


@pytest.mark.asyncio
async def test_azure_stt_provider_converts_mp3_to_wav(tmp_path):
    """Provider runs ffmpeg conversion before invoking the SDK."""
    provider = AzureSTTProvider()
    audio = tmp_path / "audio.mp3"
    audio.write_bytes(b"fake mp3")

    mock_segments = [{"id": 0, "start": 0.0, "end": 1.0, "text": "好", "word_timings": []}]

    with (
        patch("app.services.transcription_azure.subprocess.run") as mock_run,
        patch("app.services.transcription_azure._run_continuous_recognition", return_value=mock_segments),
    ):
        mock_run.return_value = MagicMock(returncode=0)
        result = await provider.transcribe(audio, {"azure_speech_key": "k", "azure_speech_region": "eastus"}, "zh-CN")

    assert mock_run.called
    cmd = mock_run.call_args[0][0]
    assert "ffmpeg" in cmd
    assert "-ar" in cmd and "16000" in cmd
    assert result == mock_segments
```

- [ ] **Step 2: Run tests to confirm they fail (module doesn't exist yet)**

```bash
cd backend && python -m pytest tests/test_transcription_azure.py -v 2>&1 | head -20
```

Expected: ImportError or ModuleNotFoundError.

- [ ] **Step 3: Write the implementation**

```python
# backend/app/services/transcription_azure.py
"""Azure AI Speech STT provider using continuous recognition."""

import asyncio
import json
import logging
import subprocess
import tempfile
import threading
from pathlib import Path

from app.services.transcription_provider import (
    TranscriptionKeys,
    _Segment,
    _WordTiming,
    _finalize_segment,
)

logger = logging.getLogger(__name__)

try:
    import azure.cognitiveservices.speech as speechsdk
except ImportError:
    speechsdk = None  # type: ignore[assignment]

_TICKS_PER_SECOND = 10_000_000


def _run_continuous_recognition(
    wav_path: Path,
    key: str,
    region: str,
    language: str,
) -> list[_Segment]:
    """Blocking: run Azure continuous speech recognition on a WAV file.

    Args:
        wav_path: Path to a WAV file (16kHz mono).
        key: Azure Speech subscription key.
        region: Azure region (e.g. 'eastus').
        language: BCP-47 language tag (e.g. 'zh-CN').

    Returns:
        List of _Segment dicts.

    Raises:
        RuntimeError: If Azure cancels with an error.
    """
    speech_config = speechsdk.SpeechConfig(subscription=key, region=region)
    speech_config.output_format = speechsdk.OutputFormat.Detailed
    speech_config.speech_recognition_language = language

    audio_config = speechsdk.AudioConfig(filename=str(wav_path))
    recognizer = speechsdk.SpeechRecognizer(
        speech_config=speech_config,
        audio_config=audio_config,
    )

    segments: list[_Segment] = []
    done = threading.Event()
    error: list[str] = []  # mutable container for error from callback

    def on_recognized(evt) -> None:
        text = evt.result.text
        if not text:
            return
        if language.startswith("zh"):
            text = text.replace(" ", "")

        word_timings: list[_WordTiming] = []
        try:
            detail = json.loads(evt.result.json)
            words = detail.get("NBest", [{}])[0].get("Words", [])
            for w in words:
                start = w["Offset"] / _TICKS_PER_SECOND
                end = start + w["Duration"] / _TICKS_PER_SECOND
                word_timings.append({"text": w["Word"], "start": start, "end": end})
        except (json.JSONDecodeError, KeyError, IndexError):
            logger.warning("Azure: could not parse word-level detail for utterance")

        seg_id = len(segments)
        if word_timings:
            seg = _finalize_segment(  # type: ignore[arg-type]
                [{"text": wt["text"], "start": wt["start"], "end": wt["end"]} for wt in word_timings],
                seg_id,
                language,
            )
            seg["word_timings"] = word_timings
        else:
            # No word timings — use utterance offset from result if available
            seg = {
                "id": seg_id,
                "start": 0.0,
                "end": 0.0,
                "text": text,
                "word_timings": [],
            }
        segments.append(seg)

    def on_session_stopped(evt) -> None:
        done.set()

    def on_canceled(evt) -> None:
        details = evt.result.cancellation_details
        if details.reason == speechsdk.CancellationReason.Error:
            error.append(details.error_details)
        done.set()

    recognizer.recognized.connect(on_recognized)
    recognizer.session_stopped.connect(on_session_stopped)
    recognizer.canceled.connect(on_canceled)

    recognizer.start_continuous_recognition()
    done.wait()
    recognizer.stop_continuous_recognition()

    if error:
        raise RuntimeError(f"Azure STT canceled: {error[0]}")

    logger.info("Azure STT complete: %d segments", len(segments))
    return segments


class AzureSTTProvider:
    """STTProvider backed by Azure AI Speech continuous recognition."""

    async def transcribe(self, audio_path: Path, keys: TranscriptionKeys, language: str) -> list[_Segment]:
        key = keys.get("azure_speech_key", "")
        region = keys.get("azure_speech_region", "")
        if not key:
            raise ValueError("Azure Speech key is required when stt_provider=azure")
        if not region:
            raise ValueError("Azure Speech region is required when stt_provider=azure")

        if speechsdk is None:
            raise RuntimeError("azure-cognitiveservices-speech is not installed")

        return await asyncio.to_thread(self._transcribe_sync, audio_path, key, region, language)

    def _transcribe_sync(self, audio_path: Path, key: str, region: str, language: str) -> list[_Segment]:
        """Convert MP3 → WAV 16kHz mono, then run continuous recognition."""
        with tempfile.TemporaryDirectory() as tmp:
            wav_path = Path(tmp) / "audio.wav"
            result = subprocess.run(
                [
                    "ffmpeg", "-y", "-i", str(audio_path),
                    "-ar", "16000", "-ac", "1", "-f", "wav", str(wav_path),
                ],
                capture_output=True,
                timeout=300,
            )
            if result.returncode != 0:
                raise RuntimeError(f"ffmpeg WAV conversion failed: {result.stderr.decode()[:200]}")

            return _run_continuous_recognition(wav_path, key, region, language)
```

- [ ] **Step 4: Run tests**

```bash
cd backend && python -m pytest tests/test_transcription_azure.py -v
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/transcription_azure.py backend/tests/test_transcription_azure.py
git commit -m "feat(stt): add AzureSTTProvider with continuous recognition and MP3→WAV conversion"
```

---

## Task 5: Create `transcription_factory.py` — tests first

**Files:**
- Create: `backend/tests/test_transcription_factory.py`
- Create: `backend/app/services/transcription_factory.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_transcription_factory.py
import pytest
from unittest.mock import patch


def test_factory_returns_deepgram_provider():
    from app.services.transcription_factory import get_stt_provider
    from app.services.transcription_deepgram import DeepgramSTTProvider
    from app.config import Settings

    settings = Settings(stt_provider="deepgram")
    provider = get_stt_provider(settings)
    assert isinstance(provider, DeepgramSTTProvider)


def test_factory_returns_azure_provider():
    from app.services.transcription_factory import get_stt_provider
    from app.services.transcription_azure import AzureSTTProvider
    from app.config import Settings

    settings = Settings(stt_provider="azure")
    provider = get_stt_provider(settings)
    assert isinstance(provider, AzureSTTProvider)


def test_factory_raises_on_unknown_provider():
    from app.services.transcription_factory import get_stt_provider
    from app.config import Settings

    settings = Settings(stt_provider="whisper")
    with pytest.raises(ValueError, match="Unknown STT provider"):
        get_stt_provider(settings)


def test_factory_is_case_insensitive():
    from app.services.transcription_factory import get_stt_provider
    from app.services.transcription_deepgram import DeepgramSTTProvider
    from app.config import Settings

    settings = Settings(stt_provider="Deepgram")
    provider = get_stt_provider(settings)
    assert isinstance(provider, DeepgramSTTProvider)
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
cd backend && python -m pytest tests/test_transcription_factory.py -v 2>&1 | head -10
```

- [ ] **Step 3: Write the implementation**

```python
# backend/app/services/transcription_factory.py
"""Factory: resolves the active STTProvider from settings."""

from app.config import Settings
from app.services.transcription_provider import STTProvider


def get_stt_provider(settings: Settings) -> STTProvider:
    """Return the STTProvider instance configured by settings.stt_provider.

    Raises:
        ValueError: If settings.stt_provider is not a known value.
    """
    provider = settings.stt_provider.lower()

    if provider == "deepgram":
        from app.services.transcription_deepgram import DeepgramSTTProvider
        return DeepgramSTTProvider()

    if provider == "azure":
        from app.services.transcription_azure import AzureSTTProvider
        return AzureSTTProvider()

    raise ValueError(
        f"Unknown STT provider: '{settings.stt_provider}'. "
        "Set SHADOWLEARN_STT_PROVIDER to 'deepgram' or 'azure'."
    )
```

- [ ] **Step 4: Run tests**

```bash
cd backend && python -m pytest tests/test_transcription_factory.py -v
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/transcription_factory.py backend/tests/test_transcription_factory.py
git commit -m "feat(stt): add transcription_factory with get_stt_provider"
```

---

## Task 6: Update `config.py` and `models.py`

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/app/models.py`

- [ ] **Step 1: Add `stt_provider` to `config.py`**

In `backend/app/config.py`, add after `tts_provider`:

```python
stt_provider: str = "deepgram"  # env: SHADOWLEARN_STT_PROVIDER; values: deepgram | azure
```

- [ ] **Step 2: Add Azure fields to `LessonRequest` in `models.py`**

In `backend/app/models.py`, add to `LessonRequest`:

```python
azure_speech_key: str | None = None
azure_speech_region: str | None = None
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/config.py backend/app/models.py
git commit -m "feat(stt): add stt_provider config and azure_speech_key/region to LessonRequest"
```

---

## Task 7: Create `/api/config` endpoint — test first

**Files:**
- Create: `backend/tests/test_config_router.py`
- Create: `backend/app/routers/config.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_config_router.py
import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import MagicMock


@pytest.mark.asyncio
async def test_get_config_returns_provider_names():
    from app.main import app

    # Patch app.state directly
    app.state.stt_provider_name = "deepgram"
    app.state.tts_provider_name = "azure"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/config")

    assert response.status_code == 200
    data = response.json()
    assert data["stt_provider"] == "deepgram"
    assert data["tts_provider"] == "azure"
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
cd backend && python -m pytest tests/test_config_router.py -v 2>&1 | head -10
```

- [ ] **Step 3: Create the router**

```python
# backend/app/routers/config.py
"""Config endpoint — exposes active provider names."""

from fastapi import APIRouter, Request

router = APIRouter(prefix="/api")


@router.get("/config")
async def get_config(request: Request) -> dict:
    """Return active STT and TTS provider names."""
    return {
        "stt_provider": request.app.state.stt_provider_name,
        "tts_provider": request.app.state.tts_provider_name,
    }
```

- [ ] **Step 4: Run test**

```bash
cd backend && python -m pytest tests/test_config_router.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/config.py backend/tests/test_config_router.py
git commit -m "feat(stt): add GET /api/config endpoint returning stt_provider and tts_provider"
```

---

## Task 8: Wire everything in `main.py`

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Update `main.py`**

Replace the existing lifespan and router imports with:

```python
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import chat, config, jobs, lessons, pronunciation, quiz, tts
from app.services.tts_factory import get_tts_provider
from app.services.transcription_factory import get_stt_provider

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.tts_provider = get_tts_provider(settings)
    app.state.tts_provider_name = settings.tts_provider
    app.state.stt_provider = get_stt_provider(settings)
    app.state.stt_provider_name = settings.stt_provider
    yield


app = FastAPI(title="ShadowLearn API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(lessons.router)
app.include_router(chat.router)
app.include_router(tts.router)
app.include_router(config.router)
app.include_router(jobs.router)
app.include_router(quiz.router)
app.include_router(pronunciation.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 2: Run existing tests to check nothing broke**

```bash
cd backend && python -m pytest tests/ -v --ignore=tests/test_transcription_azure.py 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(stt): wire STTProvider in lifespan and register /api/config router"
```

---

## Task 9: Update `lessons.py` — pass provider to background tasks

**Files:**
- Modify: `backend/app/routers/lessons.py`
- Modify: `backend/tests/test_lessons_router.py`

- [ ] **Step 1: Write updated tests first** — add to `test_lessons_router.py`:

```python
@pytest.mark.asyncio
async def test_generate_lesson_accepts_azure_keys_in_body():
    from app.models import LessonRequest

    req = LessonRequest(
        source="youtube",
        youtube_url="https://www.youtube.com/watch?v=test",
        translation_languages=["en"],
        openrouter_api_key="sk-test",
        azure_speech_key="az-key",
        azure_speech_region="eastus",
    )
    assert req.azure_speech_key == "az-key"
    assert req.azure_speech_region == "eastus"


@pytest.mark.asyncio
async def test_generate_lesson_upload_accepts_azure_form_fields():
    """generate-upload accepts azure_speech_key and azure_speech_region as form fields."""
    from unittest.mock import AsyncMock, patch

    with patch("app.routers.lessons._process_upload_lesson", new=AsyncMock()):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/lessons/generate-upload",
                files={"file": ("test.mp4", io.BytesIO(b"fake"), "video/mp4")},
                data={
                    "translation_languages": "en",
                    "openrouter_api_key": "sk-test",
                    "azure_speech_key": "az-key",
                    "azure_speech_region": "eastus",
                },
            )
    assert response.status_code == 200
    assert "job_id" in response.json()
```

- [ ] **Step 2: Run new tests to confirm they FAIL**

```bash
cd backend && python -m pytest tests/test_lessons_router.py::test_generate_lesson_accepts_azure_keys_in_body tests/test_lessons_router.py::test_generate_lesson_upload_accepts_azure_form_fields -v 2>&1 | head -20
```

- [ ] **Step 3: Update `lessons.py`**

Add the import at the top:

```python
from fastapi import APIRouter, BackgroundTasks, Form, HTTPException, Request, UploadFile
from app.services.transcription_provider import STTProvider, TranscriptionKeys
```

Update `_process_youtube_lesson` signature and transcription call:

```python
async def _process_youtube_lesson(
    request: LessonRequest,
    video_id: str,
    job_id: str,
    stt_provider: STTProvider,
) -> None:
```

Replace the transcription block (the block that checks `request.deepgram_api_key` and calls `transcribe_audio_deepgram`) with:

```python
        jobs[job_id].step = "transcription"
        keys: TranscriptionKeys = {}
        if request.deepgram_api_key:
            keys["deepgram_api_key"] = request.deepgram_api_key
        if request.azure_speech_key:
            keys["azure_speech_key"] = request.azure_speech_key
        if request.azure_speech_region:
            keys["azure_speech_region"] = request.azure_speech_region
        segments = await stt_provider.transcribe(audio_path, keys, request.source_language)
```

Remove the old `if not request.deepgram_api_key: ... return` guard block (key validation now happens inside the provider).

Update `_process_upload_lesson` signature:

```python
async def _process_upload_lesson(
    file: UploadFile,
    translation_languages: list[str],
    openrouter_api_key: str,
    job_id: str,
    deepgram_api_key: str | None = None,
    azure_speech_key: str | None = None,
    azure_speech_region: str | None = None,
    source_language: str = "zh-CN",
    stt_provider: STTProvider | None = None,
) -> None:
```

Replace the transcription block in `_process_upload_lesson`:

```python
        jobs[job_id].step = "transcription"
        t0 = time.monotonic()
        keys: TranscriptionKeys = {}
        if deepgram_api_key:
            keys["deepgram_api_key"] = deepgram_api_key
        if azure_speech_key:
            keys["azure_speech_key"] = azure_speech_key
        if azure_speech_region:
            keys["azure_speech_region"] = azure_speech_region
        if stt_provider is None:
            raise RuntimeError("No STT provider configured")
        segments = await stt_provider.transcribe(audio_path, keys, source_language)
        logger.info("[pipeline] transcription: done in %.1fs, %d segments", time.monotonic() - t0, len(segments))
```

Remove the old `if not deepgram_api_key: ... return` guard block.

Update `generate_lesson` route handler to add `req: Request` and pass `stt_provider`:

```python
@router.post("/generate")
async def generate_lesson(request: LessonRequest, background_tasks: BackgroundTasks, req: Request) -> dict:
    if request.source == "youtube":
        # ... existing validation ...
        stt_provider = req.app.state.stt_provider
        job_id = str(uuid.uuid4())
        jobs[job_id] = Job(status="processing", step="queued", result=None, error=None)
        background_tasks.add_task(_process_youtube_lesson, request, video_id, job_id, stt_provider)
        return {"job_id": job_id}
```

Update `generate_lesson_upload` to add `req: Request`, new form fields, and pass provider:

```python
@router.post("/generate-upload")
async def generate_lesson_upload(
    background_tasks: BackgroundTasks,
    req: Request,
    file: UploadFile,
    translation_languages: str = Form(...),
    openrouter_api_key: str = Form(...),
    deepgram_api_key: str | None = Form(None),
    azure_speech_key: str | None = Form(None),
    azure_speech_region: str | None = Form(None),
    source_language: str = Form("zh-CN"),
) -> dict:
    languages = [lang.strip() for lang in translation_languages.split(",") if lang.strip()]
    if not languages:
        raise HTTPException(status_code=400, detail="translation_languages must not be empty")

    stt_provider = req.app.state.stt_provider
    job_id = str(uuid.uuid4())
    jobs[job_id] = Job(status="processing", step="queued", result=None, error=None)
    background_tasks.add_task(
        _process_upload_lesson,
        file,
        languages,
        openrouter_api_key,
        job_id,
        deepgram_api_key,
        azure_speech_key,
        azure_speech_region,
        source_language,
        stt_provider,
    )
    return {"job_id": job_id}
```

Remove the old `from app.services.transcription import transcribe_audio_deepgram` import.

- [ ] **Step 4: Run all backend tests**

```bash
cd backend && python -m pytest tests/ -v 2>&1 | tail -30
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/lessons.py backend/tests/test_lessons_router.py
git commit -m "feat(stt): wire STTProvider into lesson pipeline background tasks"
```

---

## Task 10: Frontend — migrate `/api/tts/provider` → `/api/config`

**Files:**
- Modify: `frontend/src/components/settings/Settings.tsx`
- Modify: `frontend/src/components/onboarding/Setup.tsx`
- Modify: `frontend/src/hooks/useTTS.ts`

- [ ] **Step 1: Update `Settings.tsx`**

Find the `useEffect` that fetches `/api/tts/provider` (line ~35):

```typescript
useEffect(() => {
  fetch('/api/tts/provider')
    .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to fetch provider')))
    .then((data: { provider: string }) => setProvider(data.provider))
    .catch(() => setProvider('azure'))
}, [])
```

Replace with:

```typescript
useEffect(() => {
  fetch('/api/config')
    .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to fetch config')))
    .then((data: { tts_provider: string; stt_provider: string }) => setProvider(data.tts_provider))
    .catch(() => setProvider('azure'))
}, [])
```

- [ ] **Step 2: Update `Setup.tsx`** — same pattern: replace `fetch('/api/tts/provider')` with `fetch('/api/config')` and change `data.provider` to `data.tts_provider`.

- [ ] **Step 3: Update `useTTS.ts`** — same pattern: replace `fetch('/api/tts/provider')` with `fetch('/api/config')` and change `data.provider` to `data.tts_provider`.

- [ ] **Step 4: Run frontend tests**

```bash
cd frontend && npx vitest run 2>&1 | tail -20
```

Expected: all existing tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/Settings.tsx frontend/src/components/onboarding/Setup.tsx frontend/src/hooks/useTTS.ts
git commit -m "feat(stt): migrate frontend from /api/tts/provider to /api/config"
```

---

## Task 11: Frontend — `CreateLesson.tsx` STT key selection + test

**Files:**
- Modify: `frontend/src/components/create/CreateLesson.tsx`
- Create: `frontend/tests/CreateLesson.stt.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/tests/CreateLesson.stt.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { CreateLesson } from '@/components/create/CreateLesson'

// Minimal auth context mock
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    db: {},
    keys: {
      openrouterApiKey: 'or-key',
      deepgramApiKey: 'dg-key',
      azureSpeechKey: 'az-key',
      azureSpeechRegion: 'eastus',
    },
  }),
}))
vi.mock('@/contexts/LessonsContext', () => ({
  useLessons: () => ({ updateLesson: vi.fn() }),
}))
vi.mock('@/db', () => ({
  getSettings: vi.fn().mockResolvedValue(null),
  saveVideo: vi.fn(),
}))

function renderCreateLesson() {
  return render(
    <MemoryRouter>
      <CreateLesson />
    </MemoryRouter>
  )
}

describe('CreateLesson STT key selection', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('sends deepgram_api_key when stt_provider is deepgram', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ stt_provider: 'deepgram', tts_provider: 'azure' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ job_id: 'job-1' }),
      } as Response)

    renderCreateLesson()

    // Fill YouTube URL and trigger submit
    await userEvent.type(screen.getByPlaceholderText(/youtube/i), 'https://www.youtube.com/watch?v=abc12345678')
    await userEvent.click(screen.getByRole('button', { name: /generate lesson/i }))

    await waitFor(() => {
      const [, lessonCall] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      const body = JSON.parse(lessonCall[1].body)
      expect(body.deepgram_api_key).toBe('dg-key')
      expect(body.azure_speech_key).toBeUndefined()
      expect(body.azure_speech_region).toBeUndefined()
    })
  })

  it('sends azure_speech_key and region when stt_provider is azure', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ stt_provider: 'azure', tts_provider: 'azure' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ job_id: 'job-2' }),
      } as Response)

    renderCreateLesson()

    await userEvent.type(screen.getByPlaceholderText(/youtube/i), 'https://www.youtube.com/watch?v=abc12345678')
    await userEvent.click(screen.getByRole('button', { name: /generate lesson/i }))

    await waitFor(() => {
      const [, lessonCall] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      const body = JSON.parse(lessonCall[1].body)
      expect(body.azure_speech_key).toBe('az-key')
      expect(body.azure_speech_region).toBe('eastus')
      expect(body.deepgram_api_key).toBeUndefined()
    })
  })
})
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
cd frontend && npx vitest run tests/CreateLesson.stt.test.tsx 2>&1 | tail -15
```

- [ ] **Step 3: Update `CreateLesson.tsx`**

Add `sttProvider` state and fetch `/api/config` at mount. Replace the existing settings `useEffect`:

```typescript
const [sttProvider, setSttProvider] = useState<string>('deepgram')

useEffect(() => {
  fetch('/api/config')
    .then(res => res.ok ? res.json() : Promise.reject())
    .then((data: { stt_provider: string; tts_provider: string }) => setSttProvider(data.stt_provider))
    .catch(() => setSttProvider('deepgram'))
}, [])
```

In `handleGenerate`, replace the YouTube body construction from:

```typescript
deepgram_api_key: keys.deepgramApiKey ?? null,
```

with:

```typescript
...(sttProvider === 'azure'
  ? { azure_speech_key: keys.azureSpeechKey, azure_speech_region: keys.azureSpeechRegion }
  : { deepgram_api_key: keys.deepgramApiKey ?? null }),
```

Replace the upload formData block:

```typescript
// Before:
if (keys.deepgramApiKey)
  formData.append('deepgram_api_key', keys.deepgramApiKey)

// After:
if (sttProvider === 'azure') {
  if (keys.azureSpeechKey) formData.append('azure_speech_key', keys.azureSpeechKey)
  if (keys.azureSpeechRegion) formData.append('azure_speech_region', keys.azureSpeechRegion)
} else {
  if (keys.deepgramApiKey) formData.append('deepgram_api_key', keys.deepgramApiKey)
}
```

Update the `canGenerate` guard — it currently hard-gates on `keys?.deepgramApiKey`. Replace with:

```typescript
const canGenerate = (tab === 'youtube' ? !!youtubeUrl.trim() : !!file)
  && (sttProvider === 'azure' ? !!keys?.azureSpeechKey : !!keys?.deepgramApiKey)
```

Add `sttProvider` to the `useCallback` deps array.

- [ ] **Step 4: Run the new test**

```bash
cd frontend && npx vitest run tests/CreateLesson.stt.test.tsx 2>&1 | tail -15
```

Expected: both tests PASS.

- [ ] **Step 5: Run all frontend tests**

```bash
cd frontend && npx vitest run 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/create/CreateLesson.tsx frontend/tests/CreateLesson.stt.test.tsx
git commit -m "feat(stt): CreateLesson fetches stt_provider and sends only relevant API keys"
```

---

## Task 12: Frontend — gate Deepgram key field in `Settings.tsx` and `Setup.tsx`

**Files:**
- Modify: `frontend/src/components/settings/Settings.tsx`
- Modify: `frontend/src/components/onboarding/Setup.tsx`

- [ ] **Step 1: Update `Settings.tsx`**

The file already fetches TTS `provider` state (now `tts_provider`). Add `sttProvider` as a second piece of state from the same `/api/config` response. Update the `useEffect` from Task 10 to also set `sttProvider`:

```typescript
const [sttProvider, setSttProvider] = useState<string>('deepgram')

useEffect(() => {
  fetch('/api/config')
    .then(res => res.ok ? res.json() : Promise.reject())
    .then((data: { tts_provider: string; stt_provider: string }) => {
      setProvider(data.tts_provider)
      setSttProvider(data.stt_provider)
    })
    .catch(() => {
      setProvider('azure')
      setSttProvider('deepgram')
    })
}, [])
```

Find the Deepgram API key input field. Wrap it in a conditional so it only renders when `sttProvider === 'deepgram'`:

```typescript
{sttProvider === 'deepgram' && (
  <div>
    <label ...>Deepgram API Key</label>
    <Input value={editDeepgramKey} onChange={...} />
  </div>
)}
```

The exact JSX structure depends on the surrounding code — read the full file before editing to match the existing pattern.

- [ ] **Step 2: Apply the same pattern in `Setup.tsx`** — read the file first to understand its structure, then add `sttProvider` state and conditionally render the Deepgram field.

- [ ] **Step 3: Run frontend tests**

```bash
cd frontend && npx vitest run 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/settings/Settings.tsx frontend/src/components/onboarding/Setup.tsx
git commit -m "feat(stt): gate Deepgram key field on sttProvider in Settings and Setup"
```

---

## Task 13: Final integration check

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && python -m pytest tests/ -v 2>&1 | tail -30
```

Expected: all PASS.

- [ ] **Step 2: Run all frontend tests**

```bash
cd frontend && npx vitest run 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 3: Smoke test the backend boots with default config**

```bash
cd backend && SHADOWLEARN_STT_PROVIDER=deepgram python -m uvicorn app.main:app --port 8001 &
sleep 2
curl -s http://localhost:8001/api/config | python3 -m json.tool
kill %1
```

Expected output:
```json
{
  "stt_provider": "deepgram",
  "tts_provider": "azure"
}
```

- [ ] **Step 4: Smoke test with Azure provider**

```bash
cd backend && SHADOWLEARN_STT_PROVIDER=azure python -m uvicorn app.main:app --port 8001 &
sleep 2
curl -s http://localhost:8001/api/config | python3 -m json.tool
kill %1
```

Expected:
```json
{
  "stt_provider": "azure",
  "tts_provider": "azure"
}
```

- [ ] **Step 5: Commit if any fixes were needed, otherwise done**

```bash
git log --oneline -10
```
