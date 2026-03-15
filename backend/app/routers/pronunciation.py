# backend/app/routers/pronunciation.py
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, Form, HTTPException, UploadFile
from pydantic import BaseModel

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


@router.post("/assess", response_model=PronunciationResult)
async def assess_pronunciation(
    audio: UploadFile,
    reference_text: str = Form(...),
    language: str = Form("zh-CN"),
    azure_key: str = Form(...),
    azure_region: str = Form("eastus"),
):
    try:
        import azure.cognitiveservices.speech as speechsdk
    except ImportError:
        raise HTTPException(503, "Azure Speech SDK not installed")

    with tempfile.TemporaryDirectory() as tmp:
        webm_path = Path(tmp) / "input.webm"
        wav_path = Path(tmp) / "output.wav"

        # Save uploaded audio
        webm_path.write_bytes(await audio.read())

        # Transcode WebM → 16kHz mono WAV
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", str(webm_path),
             "-ar", "16000", "-ac", "1", "-f", "wav", str(wav_path)],
            capture_output=True, timeout=30,
        )
        if result.returncode != 0:
            raise HTTPException(500, f"ffmpeg failed: {result.stderr.decode()}")

        # Configure Azure pronunciation assessment
        speech_config = speechsdk.SpeechConfig(
            subscription=azure_key, region=azure_region
        )
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

        if ev.reason != speechsdk.ResultReason.RecognizedSpeech:
            raise HTTPException(422, "Speech not recognized — try speaking more clearly")

        pa_result = speechsdk.PronunciationAssessmentResult(ev)

        overall = OverallScore(
            accuracy=pa_result.accuracy_score,
            fluency=pa_result.fluency_score,
            completeness=pa_result.completeness_score,
            prosody=pa_result.prosody_score,
        )

        words = []
        for w in pa_result.words:
            error_type = w.error_type if w.error_type != "None" else None
            words.append(WordScore(
                word=w.word,
                accuracy=w.accuracy_score,
                error_type=error_type,
                error_detail=f"{w.word} — check pronunciation" if error_type else None,
            ))

        return PronunciationResult(overall=overall, words=words)
