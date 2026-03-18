# backend/app/config.py
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    max_video_duration_seconds: int = 1200  # 20 minutes
    max_upload_size_bytes: int = 2_147_483_648  # 2 GB
    allowed_video_formats: list[str] = ["mp4", "mkv", "webm", "mov"]
    translation_batch_size: int = 30
    translation_max_retries: int = 2
    openrouter_chat_url: str = "https://openrouter.ai/api/v1/chat/completions"
    openrouter_model: str = "qwen/qwen3.5-122b-a10b"
    minimax_tts_url: str = "https://api.minimax.io/v1/t2a_v2"
    tts_provider: str = "azure"  # env: SHADOWLEARN_TTS_PROVIDER; values: azure | minimax
    stt_provider: str = "deepgram"  # env: SHADOWLEARN_STT_PROVIDER; values: deepgram | azure

    model_config = {"env_prefix": "SHADOWLEARN_"}


settings = Settings()
