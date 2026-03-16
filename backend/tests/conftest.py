import pytest
from unittest.mock import AsyncMock

from app.main import app


@pytest.fixture
def mock_tts_provider():
    """Seed app.state.tts_provider with an AsyncMock for router tests.

    Without this, tests that hit TTS router endpoints will fail with
    AttributeError because the lifespan event doesn't run in test context.
    """
    provider = AsyncMock()
    app.state.tts_provider = provider
    app.state.tts_provider_name = "azure"
    return provider
