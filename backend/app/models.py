from pydantic import BaseModel, ConfigDict, Field


class Word(BaseModel):
    word: str
    romanization: str
    meaning: str
    usage: str


class Segment(BaseModel):
    id: str
    start: float
    end: float
    text: str
    romanization: str
    translations: dict[str, str]
    words: list[Word]


class LessonRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: str = Field(pattern=r"^(youtube|upload|blog)$")
    youtube_url: str | None = None
    blog_url: str | None = None
    blog_text: str | None = None
    blog_title: str | None = None
    translation_languages: list[str] = Field(min_length=1)
    source_language: str = "zh-CN"
    minimax_voice_id: str | None = None


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


class TTSRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    source_language: str = "zh-CN"
    minimax_voice_id: str | None = None
