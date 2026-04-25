"""External tools for Speak with AI agent."""
from .pronunciation import AzurePronunciationClient, create_pronunciation_client

__all__ = [
    "AzurePronunciationClient",
    "create_pronunciation_client",
]