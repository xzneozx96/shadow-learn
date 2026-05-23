from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.routers import documents, markdown, retrieval, search
from api.config import settings
from api.dependencies import AsyncSessionLocal, get_db
from api.auth import require_api_key
from api.services.document_service import DocumentService

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail closed: refuse to boot without a configured secret.
    if not settings.API_SECRET_KEY:
        raise RuntimeError("API_SECRET_KEY must be set")

    # Schema is managed by Alembic (alembic upgrade head runs in the entrypoint),
    # so we do not create_all here. Just resume any interrupted work.
    async with AsyncSessionLocal() as db:
        service = DocumentService(db)
        await service.resume_pending_tasks()

    yield

app = FastAPI(
    title="PageIndex API",
    description="Self-hosted PageIndex API for document processing and retrieval",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

_auth = [Depends(require_api_key)]
app.include_router(documents.router, prefix="/doc", tags=["Documents"], dependencies=_auth)
app.include_router(markdown.router, prefix="/markdown", tags=["Markdown"], dependencies=_auth)
app.include_router(retrieval.router, prefix="/retrieval", tags=["Retrieval"], dependencies=_auth)
app.include_router(search.router, prefix="/search", tags=["Search"], dependencies=_auth)

@app.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    """Unauthenticated liveness/readiness probe: checks DB and Redis."""
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(status_code=503, detail="database unavailable")

    try:
        client = aioredis.from_url(settings.CELERY_BROKER_URL)
        await client.ping()
        await client.aclose()
    except Exception:
        raise HTTPException(status_code=503, detail="redis unavailable")

    return {"status": "healthy"}
