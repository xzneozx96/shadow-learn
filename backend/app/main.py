import logging
from contextlib import AsyncExitStack, asynccontextmanager

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import Depends, FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.accounts.deps import current_active_user
from app.accounts.router import auth_router, users_router
from app.agent.router import router as agent_router
from app.background.router import router as jobs_router
from app.collection.router import router as collection_router
from app.config.router import router as config_router
from app.daily_review.router import router as daily_review_router
from app.db import engine
from app.internal.router import router as internal_router
from app.keys.router import router as keys_router
from app.lessons.router import router as lessons_router
from app.pageindex_tool.router import router as pageindex_tool_router
from app.pronunciation.router import router as pronunciation_router
from app.quiz.router import router as quiz_router
from app.settings import settings
from app.speak.router import router as speak_router
from app.storage import create_s3_client, ensure_bucket
from app.tips.router import router as tips_router
from app.transcription.router import router as transcription_router
from app.transcription.services.transcription_factory import get_stt_provider
from app.translation.router import router as translation_router
from app.tts.router import router as tts_router
from app.tts.services.tts_factory import get_tts_provider
from app.userdata.router import router as userdata_router
from app.vocab.router import router as vocab_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.tts_provider = get_tts_provider(settings)
    app.state.tts_provider_name = settings.tts_provider
    app.state.stt_provider = get_stt_provider(settings)
    app.state.stt_provider_name = settings.stt_provider
    async with AsyncExitStack() as stack:
        app.state.s3 = await stack.enter_async_context(create_s3_client(settings))
        await ensure_bucket(app.state.s3, settings.s3_bucket)
        yield
    await engine.dispose()


app = FastAPI(title="ShadowLearn API", lifespan=lifespan)


@app.exception_handler(RequestValidationError)
async def validation_error_without_extra_values(request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = [
        {k: v for k, v in error.items() if k != "input"} if error["type"] == "extra_forbidden" else error
        for error in exc.errors()
    ]
    return await request_validation_exception_handler(request, RequestValidationError(errors))


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origin_allowlist,
    allow_origin_regex=settings.frontend_origin_regex or None,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth_router)
app.include_router(config_router)
app.include_router(internal_router)

for router in (
    users_router,
    keys_router,
    lessons_router,
    tts_router,
    jobs_router,
    quiz_router,
    translation_router,
    transcription_router,
    pronunciation_router,
    agent_router,
    speak_router,
    vocab_router,
    collection_router,
    daily_review_router,
    tips_router,
    pageindex_tool_router,
    userdata_router,
):
    app.include_router(router, dependencies=[Depends(current_active_user)])


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/health/deps")
async def health_deps(request: Request):
    deps = {"db": "ok", "s3": "ok"}
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except (SQLAlchemyError, OSError):
        deps["db"] = "error"
    try:
        await request.app.state.s3.head_bucket(Bucket=settings.s3_bucket)
    except (BotoCoreError, ClientError):
        deps["s3"] = "error"
    return JSONResponse(deps, status_code=503 if "error" in deps.values() else 200)
