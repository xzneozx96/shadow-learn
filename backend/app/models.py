from pydantic import BaseModel, Field


class Word(BaseModel):
    word: str
    pinyin: str
    meaning: str
    usage: str


class Segment(BaseModel):
    id: str
    start: float
    end: float
    chinese: str
    pinyin: str
    translations: dict[str, str]
    words: list[Word]


class LessonRequest(BaseModel):
    source: str = Field(pattern=r"^(youtube|upload)$")
    youtube_url: str | None = None
    translation_languages: list[str] = Field(min_length=1)
    openrouter_api_key: str
    deepgram_api_key: str | None = None
    source_language: str = "zh-CN"


class LessonResponse(BaseModel):
    title: str
    source: str
    source_url: str | None
    duration: float
    segments: list[Segment]
    translation_languages: list[str]


class ChatMessageInput(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessageInput]
    video_title: str
    active_segment: Segment | None
    context_segments: list[Segment]
    openrouter_api_key: str


class TTSRequest(BaseModel):
    text: str
    minimax_api_key: str | None = None
    azure_speech_key: str | None = None
    azure_speech_region: str | None = None
