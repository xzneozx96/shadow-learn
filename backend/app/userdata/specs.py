from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel
from sqlalchemy import BigInteger, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import TypeEngine

from app.userdata import merge, schemas
from app.userdata.merge import MergeRule


@dataclass(frozen=True)
class IndexedField:
    index: str
    column: str
    json_path: str
    type: type[TypeEngine[Any]] = Text
    unique: bool = False


@dataclass(frozen=True)
class StoreSpec:
    name: str
    schema: type[BaseModel]
    key_path: tuple[str, ...] = ()
    singleton_id: str | None = None
    indexed: tuple[IndexedField, ...] = ()
    merge: MergeRule = merge.union
    client_writable: bool = True

    @property
    def table(self) -> str:
        return "userdata_" + self.name.replace("-", "_")

    def validate(self, raw: Any) -> dict[str, Any]:
        return self.schema.model_validate(raw).model_dump(mode="json", by_alias=True, exclude_unset=True)

    def record_id(self, data: dict[str, Any]) -> str:
        if self.singleton_id is not None:
            return self.singleton_id
        return ":".join(str(data[field]) for field in self.key_path)

    def index_field(self, index: str) -> IndexedField | None:
        return next((field for field in self.indexed if field.index == index), None)


_SPECS = (
    StoreSpec("settings", schemas.AppSettings, singleton_id="settings", merge=merge.keep_server),
    StoreSpec(
        "vocabulary",
        schemas.VocabEntry,
        key_path=("id",),
        indexed=(
            IndexedField("by-lesson", "source_lesson_id", "sourceLessonId"),
            IndexedField("by-date", "created_at", "createdAt"),
        ),
    ),
    StoreSpec("learner-profile", schemas.LearnerProfile, singleton_id="profile", merge=merge.learner_profile),
    StoreSpec("progress-db", schemas.ProgressStats, singleton_id="global", merge=merge.progress),
    StoreSpec("mastery-db", schemas.MasteryData, singleton_id="global", merge=merge.mastery),
    StoreSpec(
        "spaced-repetition",
        schemas.SpacedRepetitionItem,
        key_path=("itemId",),
        indexed=(IndexedField("by-due", "due_date", "dueDate"),),
    ),
    StoreSpec("session-logs", schemas.SessionLog, key_path=("sessionId",)),
    StoreSpec("mistakes-db", schemas.ErrorPattern, key_path=("patternId",), merge=merge.mistake),
    StoreSpec(
        "agent-memory",
        schemas.AgentMemory,
        key_path=("id",),
        indexed=(
            IndexedField("tags", "tags", "tags", JSONB),
            IndexedField("importance", "importance", "importance", Integer),
        ),
    ),
    StoreSpec(
        "exercise-stats",
        schemas.ExerciseStat,
        key_path=("vocabId", "exerciseType"),
        indexed=(
            IndexedField("by-vocab", "vocab_id", "vocabId"),
            IndexedField("by-exercise", "exercise_type", "exerciseType"),
        ),
        merge=merge.exercise_stat,
    ),
    StoreSpec("daily-tasks", schemas.DailyTask, key_path=("id",)),
    StoreSpec(
        "speak-sessions",
        schemas.SpeakSession,
        key_path=("sessionId",),
        indexed=(IndexedField("by-date", "started_at", "startedAt"),),
    ),
    StoreSpec(
        "shadowing-bests",
        schemas.ShadowingBest,
        key_path=("lessonId", "segmentId"),
        indexed=(
            IndexedField("by-lesson", "lesson_id", "lessonId"),
            IndexedField("by-segment", "segment_id", "segmentId"),
        ),
        merge=merge.higher_score,
    ),
    StoreSpec(
        "tip-progress",
        schemas.TipProgress,
        key_path=("key",),
        indexed=(
            IndexedField("by-course", "course_id", "courseId"),
            IndexedField("by-video", "video_id", "videoId"),
        ),
        merge=merge.later_seen,
    ),
    StoreSpec(
        "tip-notes",
        schemas.TipNote,
        key_path=("videoId", "id"),
        indexed=(IndexedField("by-video", "video_id", "videoId"),),
    ),
    StoreSpec(
        "user-materials",
        schemas.UserMaterial,
        key_path=("id",),
        indexed=(
            IndexedField("by-external", "external_id", "externalId", unique=True),
            IndexedField("by-skill", "skill", "skill"),
        ),
    ),
    StoreSpec(
        "threads",
        schemas.ThreadRecord,
        key_path=("id",),
        indexed=(
            IndexedField("by-surface", "surface", "surface"),
            IndexedField("by-owner", "owner_id", "ownerId"),
            IndexedField("by-updated", "updated_at_ms", "updatedAt", BigInteger),
        ),
    ),
    StoreSpec("thread-summaries", schemas.ThreadSummaryRecord, key_path=("threadId",)),
    StoreSpec(
        "speak-custom-situations",
        schemas.SpeakCustomSituation,
        key_path=("id",),
        client_writable=False,
    ),
)

STORES: dict[str, StoreSpec] = {spec.name: spec for spec in _SPECS}
