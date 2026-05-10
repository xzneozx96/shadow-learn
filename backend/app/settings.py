# backend/app/config.py
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    max_video_duration_seconds: int = 1200  # 20 minutes
    max_upload_size_bytes: int = 2_147_483_648  # 2 GB
    allowed_media_formats: list[str] = [
        "mp4", "mkv", "webm", "mov",  # Video
        "wav", "mp3", "m4a", "aac", "flac", "ogg", "opus"  # Audio
    ]
    translation_batch_size: int = 30
    translation_max_retries: int = 2
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_chat_url: str = "https://openrouter.ai/api/v1/chat/completions"
    openrouter_structured_model: str = "qwen/qwen3.5-flash-02-23" # "openai/gpt-4o-mini"
    openrouter_agent_model: str = "qwen/qwen3.6-35b-a3b"
    openrouter_vision_model: str = "qwen/qwen3.6-35b-a3b"  # env: SHADOWLEARN_OPENROUTER_VISION_MODEL
    # When set, requests that contain image attachments are routed to this model instead of
    # openrouter_agent_model. Must support vision inputs (e.g. "google/gemini-2.0-flash-001").
    # Leave empty to use openrouter_agent_model for all requests (vision may fail silently).
    openrouter_fallback_models: list[str] = []
    # env: SHADOWLEARN_OPENROUTER_FALLBACK_MODELS
    # Set as JSON array: '["google/gemini-2.0-flash-001","anthropic/claude-haiku-4-5"]'
    minimax_tts_url: str = "https://api.minimax.io/v1/t2a_v2"
    tts_provider: str = "minimax"  # env: SHADOWLEARN_TTS_PROVIDER; values: azure | minimax
    stt_provider: str = "deepgram"  # env: SHADOWLEARN_STT_PROVIDER; values: deepgram | azure | gladia
    ytdlp_cookies_file: str = ""  # env: SHADOWLEARN_YTDLP_COOKIES_FILE; path to Netscape cookies.txt
    ytdlp_proxy: str = ""  # env: SHADOWLEARN_YTDLP_PROXY; e.g. http://user:pass@brd.superproxy.io:22225
    ytdlp_bgutil_url: str = ""  # env: SHADOWLEARN_YTDLP_BGUTIL_URL; e.g. http://bgutil-provider:4416

    # LiveKit configuration for voice agent
    livekit_url: str = ""  # env: SHADOWLEARN_LIVEKIT_URL; e.g. wss://your-project.livekit.cloud
    livekit_api_key: str = ""  # env: SHADOWLEARN_LIVEKIT_API_KEY
    livekit_api_secret: str = ""  # env: SHADOWLEARN_LIVEKIT_API_SECRET

    # Fallback API keys for free trial — all optional; unset means trial unavailable
    openrouter_api_key: str | None = None       # env: SHADOWLEARN_OPENROUTER_API_KEY
    deepgram_api_key: str | None = None         # env: SHADOWLEARN_DEEPGRAM_API_KEY
    azure_speech_key: str | None = None         # env: SHADOWLEARN_AZURE_SPEECH_KEY
    gladia_api_keys: list[str] = []            # env: SHADOWLEARN_GLADIA_API_KEYS='["key1","key2"]' — tried in order, rotated on 402/403
    # Allowlist of frontend origins permitted to call /api/transcription/session.
    # Empty list disables the Origin check (dev convenience).
    # env: SHADOWLEARN_FRONTEND_ORIGIN_ALLOWLIST='["http://localhost:5173","https://shadowlearn.app"]'
    frontend_origin_allowlist: list[str] = []
    azure_speech_region: str | None = None      # env: SHADOWLEARN_AZURE_SPEECH_REGION
    minimax_api_key: str | None = None          # env: SHADOWLEARN_MINIMAX_API_KEY
    encryption_key: str | None = None          # env: SHADOWLEARN_ENCRYPTION_KEY
    youtube_api_key: str | None = None          # env: SHADOWLEARN_YOUTUBE_API_KEY

    # Offshore Gemini proxy — see backend/livekit_agent/http_server.py.
    # The China-side backend forwards Gemini-bound traffic here so it never
    # crosses the GFW directly. Empty base_url disables the proxy and
    # surfaces an explicit error from offshore_client.
    offshore_base_url: str = ""                 # env: SHADOWLEARN_OFFSHORE_BASE_URL
    offshore_internal_token: str = ""           # env: SHADOWLEARN_OFFSHORE_INTERNAL_TOKEN

    model_config = {"env_prefix": "SHADOWLEARN_", "env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
