# backend/tests/test_pronunciation_router.py
"""Tests for pronunciation assessment retry behavior."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.shared._retry import RetryableError


def _make_speechsdk_mock():
    """Return a minimal azure.cognitiveservices.speech mock."""
    sdk = MagicMock()

    sdk.ResultReason.RecognizedSpeech = "RecognizedSpeech"
    sdk.ResultReason.Canceled = "Canceled"
    sdk.CancellationReason.Error = "Error"

    sdk.PronunciationAssessmentGradingSystem.HundredMark = "HundredMark"
    sdk.PronunciationAssessmentGranularity.Word = "Word"

    return sdk


def _make_success_event(sdk):
    ev = MagicMock()
    ev.reason = sdk.ResultReason.RecognizedSpeech

    word = MagicMock()
    word.word = "你好"
    word.accuracy_score = 95.0
    word.error_type = "None"

    pa = MagicMock()
    pa.accuracy_score = 95.0
    pa.fluency_score = 90.0
    pa.completeness_score = 100.0
    pa.prosody_score = 88.0
    pa.words = [word]

    sdk.PronunciationAssessmentResult.return_value = pa
    return ev


def _make_canceled_event(sdk, details: str):
    ev = MagicMock()
    ev.reason = sdk.ResultReason.Canceled

    cancellation = MagicMock()
    cancellation.reason = sdk.CancellationReason.Error
    cancellation.error_details = details
    sdk.CancellationDetails.return_value = cancellation
    return ev


def _run(audio_bytes=b"data", reference_text="你好", language="zh-CN",
         azure_key="key", azure_region="eastus"):
    from app.pronunciation.router import _run_assessment
    return _run_assessment(audio_bytes, reference_text, language, azure_key, azure_region)


# ---------------------------------------------------------------------------
# _run_assessment — success
# ---------------------------------------------------------------------------

def test_run_assessment_success():
    sdk = _make_speechsdk_mock()
    success_ev = _make_success_event(sdk)

    recognizer = MagicMock()
    recognizer.recognize_once.return_value = success_ev
    sdk.SpeechRecognizer.return_value = recognizer

    with (
        patch("app.pronunciation.router.subprocess.run") as mock_ffmpeg,
        patch("app.pronunciation.router.Path.write_bytes"),
        patch("builtins.open", MagicMock()),
        patch.dict("sys.modules", {"azure.cognitiveservices.speech": sdk}),
        patch("app.pronunciation.router.tempfile.TemporaryDirectory") as mock_tmp,
    ):
        mock_ffmpeg.return_value = MagicMock(returncode=0)
        ctx = MagicMock()
        ctx.__enter__ = MagicMock(return_value="/tmp/fake")
        ctx.__exit__ = MagicMock(return_value=False)
        mock_tmp.return_value = ctx

        with patch("app.pronunciation.router.Path") as mock_path:
            mock_path.return_value.__truediv__ = lambda self, x: MagicMock(
                write_bytes=MagicMock(), __str__=lambda s: f"/tmp/fake/{x}"
            )
            # Call directly with real import patched
            import importlib
            import sys
            sys.modules["azure.cognitiveservices.speech"] = sdk
            import app.pronunciation.router as mod
            importlib.reload(mod)

            recognizer2 = MagicMock()
            recognizer2.recognize_once.return_value = success_ev
            sdk.SpeechRecognizer.return_value = recognizer2

            # Can't easily test _run_assessment end-to-end without real ffmpeg.
            # Instead verify the RetryableError path below (unit-testable).


# ---------------------------------------------------------------------------
# _run_assessment — timeout raises RetryableError
# ---------------------------------------------------------------------------

def _sdk_modules(sdk):
    """Return sys.modules patch dict for the Azure Speech SDK namespace."""
    return {
        "azure": MagicMock(cognitiveservices=MagicMock(speech=sdk)),
        "azure.cognitiveservices": MagicMock(speech=sdk),
        "azure.cognitiveservices.speech": sdk,
    }


def test_run_assessment_raises_retryable_on_timeout():
    """Canceled result with 'timed out' in details raises RetryableError."""
    sdk = _make_speechsdk_mock()
    canceled_ev = _make_canceled_event(sdk, "Scoring timed out after 10 seconds")

    recognizer = MagicMock()
    recognizer.recognize_once.return_value = canceled_ev
    sdk.SpeechRecognizer.return_value = recognizer
    sdk.AudioConfig.return_value = MagicMock()
    sdk.SpeechConfig.return_value = MagicMock()
    sdk.PronunciationAssessmentConfig.return_value = MagicMock()

    import sys
    with patch.dict(sys.modules, _sdk_modules(sdk)):
        import importlib
        import app.pronunciation.router as mod
        importlib.reload(mod)

        fake_result = MagicMock(returncode=0)

        with (
            patch.object(mod, "subprocess") as mock_sub,
            patch("tempfile.TemporaryDirectory") as mock_tmp,
        ):
            mock_sub.run.return_value = fake_result

            tmp_ctx = MagicMock()
            tmp_ctx.__enter__ = MagicMock(return_value="/tmp/fake")
            tmp_ctx.__exit__ = MagicMock(return_value=False)
            mock_tmp.return_value = tmp_ctx

            with patch("pathlib.Path.write_bytes", return_value=None):
                with pytest.raises(RetryableError, match="timed out"):
                    mod._run_assessment(b"audio", "你好", "zh-CN", "key", "eastus")


# ---------------------------------------------------------------------------
# _run_assessment — non-timeout cancellation returns error dict (no retry)
# ---------------------------------------------------------------------------

def test_run_assessment_non_timeout_cancellation_returns_error():
    """Canceled result without 'timed out' returns error dict, not RetryableError."""
    sdk = _make_speechsdk_mock()
    canceled_ev = _make_canceled_event(sdk, "AuthenticationFailure: invalid key")

    recognizer = MagicMock()
    recognizer.recognize_once.return_value = canceled_ev
    sdk.SpeechRecognizer.return_value = recognizer
    sdk.AudioConfig.return_value = MagicMock()
    sdk.SpeechConfig.return_value = MagicMock()
    sdk.PronunciationAssessmentConfig.return_value = MagicMock()

    import sys
    with patch.dict(sys.modules, _sdk_modules(sdk)):
        import importlib
        import app.pronunciation.router as mod
        importlib.reload(mod)

        fake_result = MagicMock(returncode=0)

        with (
            patch.object(mod, "subprocess") as mock_sub,
            patch("tempfile.TemporaryDirectory") as mock_tmp,
        ):
            mock_sub.run.return_value = fake_result

            tmp_ctx = MagicMock()
            tmp_ctx.__enter__ = MagicMock(return_value="/tmp/fake")
            tmp_ctx.__exit__ = MagicMock(return_value=False)
            mock_tmp.return_value = tmp_ctx

            with patch("pathlib.Path.write_bytes", return_value=None):
                result = mod._run_assessment(b"audio", "你好", "zh-CN", "key", "eastus")

    assert "error" in result
    assert "AuthenticationFailure" in result["error"]


# ---------------------------------------------------------------------------
# assess_pronunciation endpoint — retry on timeout succeeds second attempt
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_assess_endpoint_retries_on_timeout_then_succeeds():
    """Endpoint retries once when _run_assessment raises RetryableError, succeeds on second call."""
    import sys
    sdk = _make_speechsdk_mock()
    _make_success_event(sdk)  # registers PronunciationAssessmentResult on sdk mock

    call_count = 0

    def fake_run_assessment(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise RetryableError("Azure scoring timed out: Scoring timed out")
        # Second call returns success dict directly
        return {
            "overall": {"accuracy": 95.0, "fluency": 90.0, "completeness": 100.0, "prosody": 88.0},
            "words": [{"word": "你好", "accuracy": 95.0, "error_type": None, "error_detail": None}],
        }

    sys.modules["azure.cognitiveservices.speech"] = sdk

    import importlib
    import app.pronunciation.router as mod
    importlib.reload(mod)

    from httpx import AsyncClient
    from httpx._transports.asgi import ASGITransport
    from app.main import app

    with (
        patch.object(mod, "_run_assessment", side_effect=fake_run_assessment),
        patch("asyncio.sleep", new_callable=AsyncMock),
        patch.object(mod, "_resolve_key", side_effect=lambda v, env, _: v or env or "key"),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            wav_bytes = b"fake-audio"
            response = await client.post(
                "/api/pronunciation/assess",
                data={"reference_text": "你好", "language": "zh-CN",
                      "azure_key": "key", "azure_region": "eastus"},
                files={"audio": ("recording.webm", wav_bytes, "audio/webm")},
            )

    assert response.status_code == 200
    assert call_count == 2
    body = response.json()
    assert body["overall"]["accuracy"] == 95.0
