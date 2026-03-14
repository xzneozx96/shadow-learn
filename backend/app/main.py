from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import chat, lessons, tts

app = FastAPI(title="ShadowLearn API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(lessons.router)
app.include_router(chat.router)
app.include_router(tts.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
