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
