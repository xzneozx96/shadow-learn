"""lessons, media, jobs, catalog

Revision ID: 0005_lessons_media_jobs_catalog
Revises: 0004_userdata_stores
Create Date: 2026-09-23

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0005_lessons_media_jobs_catalog"
down_revision: str | Sequence[str] | None = "0004_userdata_stores"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

media_kind = sa.Enum("video", "audio", "shadowing", "tts", name="media_kind")


def _created_at() -> sa.Column:
    return sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False)


def upgrade() -> None:
    op.create_table(
        "jobs",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("key", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("step", sa.Text(), nullable=False),
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        _created_at(),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_jobs_created_at", "jobs", ["created_at"])
    op.create_index("ix_jobs_user_id", "jobs", ["user_id"])
    op.create_index("uq_jobs_live_key", "jobs", ["key"], unique=True, postgresql_where=sa.text("status <> 'error'"))

    op.create_table(
        "lessons",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("duration_s", sa.Float(), nullable=False),
        sa.Column("source_language", sa.Text(), nullable=False),
        sa.Column("translation_languages", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        _created_at(),
        sa.Column("last_opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lessons_user_id", "lessons", ["user_id"])

    op.create_table(
        "lesson_segments",
        sa.Column("lesson_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("start_s", sa.Float(), nullable=False),
        sa.Column("end_s", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["lesson_id"], ["lessons.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("lesson_id", "position"),
    )

    op.create_table(
        "media_objects",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("kind", media_kind, nullable=False),
        sa.Column("lesson_id", sa.Uuid(), nullable=True),
        sa.Column("segment_id", sa.Text(), nullable=True),
        sa.Column("object_key", sa.Text(), nullable=False),
        sa.Column("size", sa.BigInteger(), nullable=False),
        sa.Column("sha256", sa.Text(), nullable=False),
        sa.Column("content_type", sa.Text(), nullable=False),
        _created_at(),
        sa.CheckConstraint("(kind = 'tts') = (user_id IS NULL AND lesson_id IS NULL)", name="ck_media_objects_owner"),
        sa.ForeignKeyConstraint(["lesson_id"], ["lessons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("object_key"),
    )
    op.create_index("ix_media_objects_lesson_id", "media_objects", ["lesson_id"])
    op.create_index("ix_media_objects_user_id", "media_objects", ["user_id"])
    op.create_index(
        "uq_media_objects_shadowing",
        "media_objects",
        ["user_id", "lesson_id", "segment_id"],
        unique=True,
        postgresql_where=sa.text("kind = 'shadowing'"),
    )

    op.create_table(
        "catalog_tts",
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("media_id", sa.Uuid(), nullable=False),
        _created_at(),
        sa.ForeignKeyConstraint(["media_id"], ["media_objects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("key"),
    )
    op.create_table(
        "catalog_word_breakdowns",
        sa.Column("word", sa.Text(), nullable=False),
        sa.Column("lang", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        _created_at(),
        sa.PrimaryKeyConstraint("word", "lang"),
    )
    op.create_table(
        "catalog_tip_transcripts",
        sa.Column("video_id", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        _created_at(),
        sa.PrimaryKeyConstraint("video_id"),
    )
    op.create_table(
        "catalog_tip_studio",
        sa.Column("video_id", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("locale", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        _created_at(),
        sa.PrimaryKeyConstraint("video_id", "kind", "locale"),
    )
    op.create_table(
        "catalog_tip_cards",
        sa.Column("video_id", sa.Text(), nullable=False),
        sa.Column("locale", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        _created_at(),
        sa.PrimaryKeyConstraint("video_id", "locale"),
    )


def downgrade() -> None:
    op.drop_table("catalog_tip_cards")
    op.drop_table("catalog_tip_studio")
    op.drop_table("catalog_tip_transcripts")
    op.drop_table("catalog_word_breakdowns")
    op.drop_table("catalog_tts")
    op.drop_table("media_objects")
    op.drop_table("lesson_segments")
    op.drop_table("lessons")
    op.drop_table("jobs")
    media_kind.drop(op.get_bind())
