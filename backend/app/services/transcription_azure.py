"""Azure AI Speech STT provider using continuous recognition."""

import asyncio
import json
import logging
import subprocess
import tempfile
import threading
from pathlib import Path

from typing import TypedDict

from app.services.transcription_provider import (
    TranscriptionKeys,
    _Segment,
    _Word,
    _WordTiming,
    _finalize_segment,
)

logger = logging.getLogger(__name__)


class _AzureWord(TypedDict):
    Word: str
    Offset: int  # 100-nanosecond ticks
    Duration: int  # 100-nanosecond ticks


class _AzureNBest(TypedDict):
    Words: list[_AzureWord]


class _AzureDetailResult(TypedDict):
    NBest: list[_AzureNBest]

try:
    import azure.cognitiveservices.speech as speechsdk
except ImportError:
    speechsdk = None  # type: ignore[assignment]

_TICKS_PER_SECOND = 10_000_000
_RECOGNITION_TIMEOUT_SECONDS = 600  # 10 minutes — fail loudly rather than hang forever


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
            logger.debug("Azure STT: recognized event with empty text, skipping")
            return
        if language.startswith("zh"):
            text = text.replace(" ", "")

        word_timings: list[_WordTiming] = []
        try:
            detail: _AzureDetailResult = json.loads(evt.result.json)
            nbest = detail.get("NBest", [])
            azure_words: list[_AzureWord] = nbest[0].get("Words", []) if nbest else []
            for w in azure_words:
                start = w["Offset"] / _TICKS_PER_SECOND
                end = start + w["Duration"] / _TICKS_PER_SECOND
                word_timings.append({"text": w["Word"], "start": start, "end": end})
        except (json.JSONDecodeError, KeyError, IndexError):
            logger.warning("Azure: could not parse word-level detail for utterance")

        seg_id = len(segments)
        if word_timings:
            word_dicts: list[_Word] = [{"text": wt["text"], "start": wt["start"], "end": wt["end"]} for wt in word_timings]
            seg = _finalize_segment(word_dicts, seg_id, language)
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
        logger.debug("Azure STT: utterance #%d — %d words, text=%r", seg_id, len(word_timings), text[:60])
        segments.append(seg)

    def on_session_stopped(evt) -> None:
        logger.info("Azure STT: session stopped cleanly")
        done.set()

    def on_canceled(evt) -> None:
        details = evt.result.cancellation_details
        if details.reason == speechsdk.CancellationReason.Error:
            error.append(details.error_details)
        else:
            logger.warning("Azure STT canceled (non-error reason: %s)", details.reason)
        done.set()

    recognizer.recognized.connect(on_recognized)
    recognizer.session_stopped.connect(on_session_stopped)
    recognizer.canceled.connect(on_canceled)

    logger.info("Azure STT: starting continuous recognition (language=%s)", language)
    recognizer.start_continuous_recognition()
    finished = done.wait(timeout=_RECOGNITION_TIMEOUT_SECONDS)
    recognizer.stop_continuous_recognition()

    if not finished:
        raise RuntimeError(
            f"Azure STT timed out after {_RECOGNITION_TIMEOUT_SECONDS}s — "
            "session_stopped/canceled never fired"
        )

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

        return await asyncio.to_thread(self._transcribe_sync, audio_path, key, region, language)

    def _transcribe_sync(self, audio_path: Path, key: str, region: str, language: str) -> list[_Segment]:
        """Convert MP3 → WAV 16kHz mono, then run continuous recognition."""
        with tempfile.TemporaryDirectory() as tmp:
            wav_path = Path(tmp) / "audio.wav"
            logger.info("Azure STT: converting %s → WAV 16kHz mono", audio_path.name)
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

            wav_size_mb = wav_path.stat().st_size / 1024 / 1024 if wav_path.exists() else 0.0
            logger.info("Azure STT: WAV ready (%.1f MB), handing off to recognizer", wav_size_mb)
            return _run_continuous_recognition(wav_path, key, region, language)
