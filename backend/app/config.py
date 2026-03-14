from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    max_video_duration_seconds: int = 7200  # 2 hours
    max_upload_size_bytes: int = 2_147_483_648  # 2 GB
    allowed_video_formats: list[str] = ["mp4", "mkv", "webm", "mov"]
    translation_batch_size: int = 30
    translation_max_retries: int = 2
    openrouter_chat_url: str = "https://openrouter.ai/api/v1/chat/completions"

    model_config = {"env_prefix": "SHADOWLEARN_"}


settings = Settings()
