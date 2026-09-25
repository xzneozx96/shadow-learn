from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Number = int | float
Skill = Literal["writing", "speaking", "vocabulary", "reading", "listening"]


class Record(BaseModel):
    model_config = ConfigDict(extra="allow", alias_generator=to_camel, populate_by_name=True)


class AppSettings(Record):
    translation_language: str | None = None
    ui_language: Literal["en", "vi"] | None = None
    minimax_voice_id: str | None = None


class VocabEntry(Record):
    id: str
    word: str | None = None
    romanization: str | None = None
    meaning: str | None = None
    usage: str | None = None
    source_lesson_id: str
    source_lesson_title: str | None = None
    source_segment_id: str | None = None
    source_segment_text: str | None = None
    source_segment_translation: str | None = None
    source_language: str | None = None
    created_at: str


class LearnerProfile(Record):
    name: str | None = None
    native_language: str | None = None
    target_language: str | None = None
    current_level: str | None = None
    daily_goal_minutes: Number | None = None
    current_streak_days: int | None = None
    total_sessions: int | None = None
    total_study_minutes: Number | None = None
    last_study_date: str | None = None
    profile_created: str | None = None


class DailyAccuracy(Record):
    date: str
    accuracy: Number | None = None
    exercises: int | None = None


class SkillStats(Record):
    sessions: int | None = None
    accuracy: Number | None = None
    last_practiced: str | None = None


class ProgressStats(Record):
    total_sessions: int | None = None
    total_exercises: int | None = None
    total_correct: int | None = None
    total_incorrect: int | None = None
    accuracy_rate: Number | None = None
    total_study_minutes: Number | None = None
    accuracy_trend: list[DailyAccuracy] | None = None
    skill_progress: dict[Skill, SkillStats] | None = None


class SkillMastery(Record):
    mastery_level: Number | None = None
    confidence_score: Number | None = None
    total_practice_time: Number | None = None
    last_practiced: str | None = None


class MasteryData(Record):
    writing: SkillMastery | None = None
    speaking: SkillMastery | None = None
    vocabulary: SkillMastery | None = None
    reading: SkillMastery | None = None
    listening: SkillMastery | None = None


class ReviewEntry(Record):
    date: str | None = None
    quality: Number | None = None
    interval_days: Number | None = None


class SpacedRepetitionItem(Record):
    item_id: str
    item_type: Literal["vocabulary"] | None = None
    easiness_factor: Number | None = None
    interval_days: Number | None = None
    repetitions: int | None = None
    consecutive_correct: int | None = None
    consecutive_incorrect: int | None = None
    mastery_level: Number | None = None
    due_date: str
    last_reviewed: str | None = None
    review_history: list[ReviewEntry] | None = None


class SessionLog(Record):
    session_id: str
    date: str | None = None
    duration_minutes: Number | None = None
    skill_practiced: Skill | Literal["mixed"] | None = None
    exercises_completed: int | None = None
    exercises_correct: int | None = None
    accuracy: Number | None = None
    items_mastered: list[str] | None = None


class MistakeExample(Record):
    user_answer: str | None = None
    correct_answer: str | None = None
    context: str | None = None
    date: str | None = None


class ErrorPattern(Record):
    pattern_id: str
    frequency: int | None = None
    last_occurred: str | None = None
    examples: list[MistakeExample] | None = None


class AgentMemory(Record):
    id: str
    content: str | None = None
    tags: list[str]
    importance: Literal[1, 2, 3]
    created_at: Number | None = None
    last_accessed_at: Number | None = None
    lesson_id: str | None = None


class ExerciseStat(Record):
    vocab_id: str
    exercise_type: str
    correct: int | None = None
    total: int | None = None
    last_attempt: str | None = None


class DailyTask(Record):
    id: str
    title: str | None = None
    created_date: str | None = None
    completed_date: str | None = None


class SpeakTurn(Record):
    id: str | None = None
    role: Literal["user", "assistant"] | None = None
    content: str | None = None
    timestamp: str | None = None
    translation: str | None = None
    romanization: str | None = None


class SpeakSession(Record):
    session_id: str
    lesson_id: str | None = None
    started_at: str
    ended_at: str | None = None
    duration_seconds: Number | None = None
    status: Literal["active", "completed", "abandoned"] | None = None
    transcript: list[SpeakTurn] | None = None
    transcript_text: str | None = None
    evaluation: dict[str, Any] | None = None
    feedbacks: dict[str, dict[str, Any]] | None = None
    prompt_version: str | None = None
    model_id: str | None = None
    target_language: str | None = None
    proficiency_level: Literal["beginner", "intermediate", "advanced"] | None = None
    level_label: str | None = None
    situation_title: str | None = None
    user_goal: str | None = None


class ShadowingBest(Record):
    lesson_id: str
    segment_id: str
    score: Number | None = None
    breakdown: dict[str, Any] | None = None
    recorded_at: str | None = None


class TipProgress(Record):
    key: str
    course_id: str
    video_id: str
    watched_sec: Number | None = None
    total_sec: Number | None = None
    completed: bool | None = None
    completed_at: str | None = None
    last_seen_at: str | None = None
    title: str | None = None
    resume_route: str | None = None


class TipNote(Record):
    id: str
    video_id: str
    title: str | None = None
    html: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    source: Literal["chat", "studio", "freeform"] | None = None
    source_ref: dict[str, Any] | None = None


class TipCardState(Record):
    state: Literal["new", "known", "learning"] | None = None
    updated_at: str | None = None


class TipCardStates(Record):
    video_id: str
    locale: Literal["en", "vi"]
    states: dict[str, TipCardState] | None = None


class WordStory(Record):
    word: str
    lang: str
    story: str | None = None
    updated_at: str | None = None


class UserMaterial(Record):
    id: str
    source: Literal["playlist", "video"] | None = None
    external_id: str
    name: str | None = None
    skill: Literal["Pronunciation", "Vocabulary", "Speaking", "Grammar", "Learning Tips"]
    instruction_language: Literal["English", "Vietnamese", "Chinese"] | None = None
    content_type: Literal["tip"] | None = None
    cached_meta: dict[str, Any] | None = None
    created_at: str | None = None


class ThreadRecord(Record):
    id: str
    surface: Literal["lesson", "global", "tip"]
    owner_id: str | None
    course_id: str | None = None
    video_id: str | None = None
    messages: list[dict[str, Any]] | None = None
    updated_at: int
    created_at: int | None = None


class ThreadSummaryRecord(Record):
    thread_id: str
    summary: str | None = None
    covers_through_message_id: str | None = None
    covers_through_index: int | None = None
    token_budget: int | None = None
    created_at: Number | None = None


class TargetVocab(BaseModel):
    term: str
    meaning: str = ""


class SpeakCustomSituation(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    title: str
    ai_role: str
    scene_context: str
    opening_line: str
    opening_line_translation: str = ""
    user_goal: str
    target_vocab: list[TargetVocab]
    language: str
    level_label: str = ""
    interface_language: str = "en"


class BulkRequest(BaseModel):
    mode: Literal["import", "replace"]
    records: list[dict[str, Any]]
    source: str | None = Field(default=None, min_length=1, max_length=100)


class BulkResponse(BaseModel):
    count: int
    after: list[dict[str, Any]] | None = None
    outcomes: dict[str, Literal["stored", "merged", "kept_server", "conflict"]] | None = None
