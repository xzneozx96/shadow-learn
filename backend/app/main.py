import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import chat, config, jobs, lessons, pronunciation, quiz, translation_exercise, tts
from app.services.tts_factory import get_tts_provider
from app.services.transcription_factory import get_stt_provider

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
    yield


app = FastAPI(title="ShadowLearn API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(lessons.router)
app.include_router(chat.router)
app.include_router(tts.router)
app.include_router(config.router)
app.include_router(jobs.router)
app.include_router(quiz.router)
app.include_router(translation_exercise.router)
app.include_router(pronunciation.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
