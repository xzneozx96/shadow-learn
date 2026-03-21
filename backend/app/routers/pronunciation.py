# backend/app/routers/pronunciation.py
import asyncio
import subprocess
import tempfile
import time
from pathlib import Path

from fastapi import APIRouter, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.config import settings
from app.routers._utils import _resolve_key

router = APIRouter(prefix="/api/pronunciation", tags=["pronunciation"])


class WordScore(BaseModel):
    word: str
    accuracy: float
    error_type: str | None
    error_detail: str | None


class OverallScore(BaseModel):
    accuracy: float
    fluency: float
    completeness: float
    prosody: float


class PronunciationResult(BaseModel):
    overall: OverallScore
    words: list[WordScore]


def _run_assessment(
    audio_bytes: bytes,
    reference_text: str,
    language: str,
    azure_key: str,
    azure_region: str,
) -> dict:
    """Blocking — runs on a thread via asyncio.to_thread."""
    import azure.cognitiveservices.speech as speechsdk

    with tempfile.TemporaryDirectory() as tmp:
        webm_path = Path(tmp) / "input.webm"
        wav_path = Path(tmp) / "output.wav"

        webm_path.write_bytes(audio_bytes)

        t0 = time.perf_counter()
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", str(webm_path),
             "-ar", "16000", "-ac", "1", "-f", "wav", str(wav_path)],
            capture_output=True, timeout=30,
        )
        print(f"[assess] ffmpeg: {time.perf_counter() - t0:.2f}s")
        if result.returncode != 0:
            return {"error": f"ffmpeg failed: {result.stderr.decode()}"}

        t1 = time.perf_counter()
        speech_config = speechsdk.SpeechConfig(subscription=azure_key, region=azure_region)
        audio_config = speechsdk.AudioConfig(filename=str(wav_path))
        pronunciation_config = speechsdk.PronunciationAssessmentConfig(
            reference_text=reference_text,
            grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
            granularity=speechsdk.PronunciationAssessmentGranularity.Word,
            enable_miscue=True,
        )
        pronunciation_config.enable_prosody_assessment()

        recognizer = speechsdk.SpeechRecognizer(
            speech_config=speech_config,
            audio_config=audio_config,
            language=language,
        )
        pronunciation_config.apply_to(recognizer)

        ev = recognizer.recognize_once()
        print(f"[assess] recognize_once: {time.perf_counter() - t1:.2f}s  reason={ev.reason}")

        if ev.reason != speechsdk.ResultReason.RecognizedSpeech:
            return {"error": "Speech not recognized"}

        pa = speechsdk.PronunciationAssessmentResult(ev)

        return {
            "overall": {
                "accuracy": pa.accuracy_score or 0.0,
                "fluency": pa.fluency_score or 0.0,
                "completeness": pa.completeness_score or 0.0,
                "prosody": pa.prosody_score or 0.0,
            },
            "words": [
                {
                    "word": w.word,
                    "accuracy": w.accuracy_score or 0.0,
                    "error_type": w.error_type if w.error_type != "None" else None,
                    "error_detail": None,
                }
                for w in pa.words
            ],
        }


@router.post("/assess", response_model=PronunciationResult)
async def assess_pronunciation(
    audio: UploadFile,
    reference_text: str = Form(...),
    language: str = Form("zh-CN"),
    azure_key: str | None = Form(None),
    azure_region: str | None = Form(None),
):
    try:
        import azure.cognitiveservices.speech  # noqa: F401
    except ImportError:
        raise HTTPException(503, "Azure Speech SDK not installed")

    resolved_key = _resolve_key(azure_key, settings.azure_speech_key, "Azure Speech key")
    resolved_region = _resolve_key(azure_region, settings.azure_speech_region, "Azure Speech region")

    t0 = time.perf_counter()
    audio_bytes = await audio.read()
    print(f"[assess] upload read: {time.perf_counter() - t0:.2f}s ({len(audio_bytes)} bytes)")

    data = await asyncio.to_thread(
        _run_assessment, audio_bytes, reference_text, language, resolved_key, resolved_region,
    )

    if "error" in data:
        raise HTTPException(422 if "not recognized" in data["error"] else 500, data["error"])

    return PronunciationResult(
        overall=OverallScore(**data["overall"]),
        words=[WordScore(**w) for w in data["words"]],
    )
