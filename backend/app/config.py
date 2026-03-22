# backend/app/config.py
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    max_video_duration_seconds: int = 1200  # 20 minutes
    max_upload_size_bytes: int = 2_147_483_648  # 2 GB
    allowed_video_formats: list[str] = ["mp4", "mkv", "webm", "mov"]
    translation_batch_size: int = 30
    translation_max_retries: int = 2
    openrouter_chat_url: str = "https://openrouter.ai/api/v1/chat/completions"
    openrouter_structured_model: str = "openai/gpt-oss-120b" # "openai/gpt-4o-mini"
    openrouter_agent_model: str = "deepseek/deepseek-v3.2"
    minimax_tts_url: str = "https://api.minimax.io/v1/t2a_v2"
    tts_provider: str = "minimax"  # env: SHADOWLEARN_TTS_PROVIDER; values: azure | minimax
    stt_provider: str = "deepgram"  # env: SHADOWLEARN_STT_PROVIDER; values: deepgram | azure
    ytdlp_cookies_file: str = ""  # env: SHADOWLEARN_YTDLP_COOKIES_FILE; path to Netscape cookies.txt
    ytdlp_proxy: str = ""  # env: SHADOWLEARN_YTDLP_PROXY; e.g. http://user:pass@brd.superproxy.io:22225
    ytdlp_bgutil_url: str = ""  # env: SHADOWLEARN_YTDLP_BGUTIL_URL; e.g. http://bgutil-provider:4416

    # Fallback API keys for free trial — all optional; unset means trial unavailable
    openrouter_api_key: str | None = None       # env: SHADOWLEARN_OPENROUTER_API_KEY
    deepgram_api_key: str | None = None         # env: SHADOWLEARN_DEEPGRAM_API_KEY
    azure_speech_key: str | None = None         # env: SHADOWLEARN_AZURE_SPEECH_KEY
    azure_speech_region: str | None = None      # env: SHADOWLEARN_AZURE_SPEECH_REGION
    minimax_api_key: str | None = None          # env: SHADOWLEARN_MINIMAX_API_KEY

    model_config = {"env_prefix": "SHADOWLEARN_", "env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
