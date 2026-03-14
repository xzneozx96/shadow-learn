# backend/app/config.py
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    max_video_duration_seconds: int = 7200  # 2 hours
    max_upload_size_bytes: int = 2_147_483_648  # 2 GB
    allowed_video_formats: list[str] = ["mp4", "mkv", "webm", "mov"]
    translation_batch_size: int = 30
    translation_max_retries: int = 2
    openai_chat_url: str = "https://api.openai.com/v1/chat/completions"
    minimax_tts_url: str = "https://api.minimaxi.com/v1/t2a_v2"

    model_config = {"env_prefix": "SHADOWLEARN_"}


settings = Settings()
