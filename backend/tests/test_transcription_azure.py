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
