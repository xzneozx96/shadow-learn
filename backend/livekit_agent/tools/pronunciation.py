"""Pronunciation assessment placeholder.

This module is a placeholder. Real-time pronunciation assessment is not feasible
with OpenAI Realtime due to lack of audio-text pairing.

Future options to re-evaluate:
- Post-session pronunciation with session recording
- Switch to external STT with timestamps
- LLM-based pronunciation estimation
"""
import logging
from typing import Optional

logger = logging.getLogger("speak-with-ai.pronunciation")


class PronunciationResult:
    """Placeholder result of pronunciation assessment."""

    def __init__(
        self,
        accuracy_score: float = 0.0,
        fluency_score: float = 0.0,
        completeness_score: float = 0.0,
        pronunciation_score: float = 0.0,
        phonemes: list[dict] = None,
    ):
        self.accuracy_score = accuracy_score
        self.fluency_score = fluency_score
        self.completeness_score = completeness_score
        self.pronunciation_score = pronunciation_score
        self.phonemes = phonemes or []

    def to_dict(self) -> dict:
        return {
            "accuracy_score": self.accuracy_score,
            "fluency_score": self.fluency_score,
            "completeness_score": self.completeness_score,
            "pronunciation_score": self.pronunciation_score,
            "phonemes": self.phonemes,
        }


class AzurePronunciationClient:
    """Placeholder client - not implemented."""

    def __init__(
        self,
        api_key: str,
        region: str = "eastus",
    ):
        """Initialize the client (placeholder only)."""
        logger.warning(
            "Azure pronunciation not implemented - requires post-session "
            "or LLM-based approach"
        )

    async def assess(
        self,
        reference_text: str,
        audio_data: Optional[bytes] = None,
        language: str = "zh-CN",
    ) -> PronunciationResult:
        """Placeholder - returns empty result."""
        logger.debug(
            "Pronunciation assessment skipped - not available in real-time"
        )
        return PronunciationResult()


async def create_pronunciation_client(
    api_key: Optional[str] = None,
    region: Optional[str] = None,
) -> Optional[AzurePronunciationClient]:
    """Create a placeholder client."""
    logger.warning(
        "Pronunciation assessment not implemented - returning None"
    )
    return None