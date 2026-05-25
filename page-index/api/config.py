from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode
from typing import Annotated, List

class Settings(BaseSettings):
    # API
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    # Shared secret required on every protected route. Enforced non-empty at app startup.
    API_SECRET_KEY: str = ""
    # Allowed CORS origins. Empty = no cross-origin access (safe prod default).
    # Accepts a comma-separated string or a JSON array via env.
    CORS_ORIGINS: Annotated[List[str], NoDecode] = []

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost/pageindex"

    # Storage
    UPLOAD_DIR: str = "./storage/uploads"
    RESULTS_DIR: str = "./storage/results"
    MAX_UPLOAD_MB: int = 50

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"

    # On startup, a PROCESSING doc younger than this is assumed to be actively
    # running in a worker and is NOT re-queued. Raise it above your p99 indexing
    # time so live indexing jobs aren't duplicate-dispatched.
    STALE_PROCESSING_MINUTES: int = 15

    # LLM (OpenAI default; OpenRouter via OPENROUTER_API_KEY + "openrouter/<model>")
    OPENAI_API_KEY: str = ""
    # Model used for the indexing/tree-building pipeline.
    OPENAI_MODEL: str = "openrouter/qwen/qwen3.5-flash-02-23"
    # Model used for retrieval reasoning. Falls back to OPENAI_MODEL if empty.
    RETRIEVAL_MODEL: str = "openrouter/deepseek/deepseek-v4-flash"
    OPENROUTER_API_KEY: str = ""
    LLM_TIMEOUT_SECONDS: int = 60

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_cors(cls, v):
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return []
            if s.startswith("["):
                return v  # let pydantic parse JSON
            return [o.strip() for o in s.split(",") if o.strip()]
        return v

    class Config:
        env_file = ".env"
        extra = "ignore" # Allow extra env vars in .env file

settings = Settings()
