import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.settings import settings
from app.lessons.router import router as lessons_router
from app.tts.router import router as tts_router
from app.translation.router import router as translation_router
from app.pronunciation.router import router as pronunciation_router
from app.quiz.router import router as quiz_router
from app.speak.router import router as speak_router
from app.agent.router import router as agent_router
from app.background.router import router as jobs_router
from app.config.router import router as config_router
from app.tts.services.tts_factory import get_tts_provider
from app.transcription.services.transcription_factory import get_stt_provider

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

app.include_router(lessons_router)
app.include_router(tts_router)
app.include_router(config_router)
app.include_router(jobs_router)
app.include_router(quiz_router)
app.include_router(translation_router)
app.include_router(pronunciation_router)
app.include_router(agent_router)
app.include_router(speak_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}