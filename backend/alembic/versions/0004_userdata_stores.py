"""userdata stores

Revision ID: 0004_userdata_stores
Revises: 0003_provider_keys
Create Date: 2026-09-23

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0004_userdata_stores"
down_revision: str | Sequence[str] | None = "0003_provider_keys"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "userdata_agent_memory",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("importance", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "id"),
    )
    op.create_table(
        "userdata_daily_tasks",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "id"),
    )
    op.create_table(
        "userdata_exercise_stats",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("vocab_id", sa.Text(), nullable=True),
        sa.Column("exercise_type", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "id"),
    )
    op.create_table(
        "userdata_import_digests",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("store", sa.Text(), nullable=False),
        sa.Column("digest", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "store", "digest"),
    )
    op.create_table(
        "userdata_learner_profile",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "id"),
    )
    op.create_table(
        "userdata_mastery_db",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "id"),
    )
    op.create_table(
        "userdata_mistakes_db",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "id"),
    )
    op.create_table(
        "userdata_progress_db",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "id"),
    )
    op.create_table(
        "userdata_session_logs",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "id"),
    )
    op.create_table(
        "userdata_settings",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "id"),
    )
    op.create_table(
        "userdata_shadowing_bests",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("lesson_id", sa.Text(), nullable=True),
        sa.Column("segment_id", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "id"),
    )
    op.create_table(
        "userdata_spaced_repetition",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("due_date", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "id"),
    )
    op.create_table(
        "userdata_speak_custom_situations",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "id"),
    )
    op.create_table(
        "userdata_speak_sessions",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("started_at", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "id"),
    )
    op.create_table(
        "userdata_thread_summaries",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "id"),
    )
    op.create_table(
        "userdata_threads",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("surface", sa.Text(), nullable=True),
        sa.Column("owner_id", sa.Text(), nullable=True),
        sa.Column("updated_at_ms", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "id"),
    )
    op.create_table(
        "userdata_tip_notes",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("video_id", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "id"),
    )
    op.create_table(
        "userdata_tip_progress",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("course_id", sa.Text(), nullable=True),
        sa.Column("video_id", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "id"),
    )
    op.create_table(
        "userdata_user_materials",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("external_id", sa.Text(), nullable=True),
        sa.Column("skill", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "id"),
    )
    op.create_table(
        "userdata_vocabulary",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("source_lesson_id", sa.Text(), nullable=True),
        sa.Column("created_at", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "id"),
    )
    op.create_index(
        "ix_userdata_agent_memory_importance",
        "userdata_agent_memory",
        ["user_id", "importance"],
        unique=False,
    )
    op.create_index(
        "ix_userdata_agent_memory_tags",
        "userdata_agent_memory",
        ["tags"],
        unique=False,
        postgresql_using="gin",
    )
    op.create_index(
        "ix_userdata_exercise_stats_exercise_type",
        "userdata_exercise_stats",
        ["user_id", "exercise_type"],
        unique=False,
    )
    op.create_index(
        "ix_userdata_exercise_stats_vocab_id",
        "userdata_exercise_stats",
        ["user_id", "vocab_id"],
        unique=False,
    )
    op.create_index(
        "ix_userdata_shadowing_bests_lesson_id",
        "userdata_shadowing_bests",
        ["user_id", "lesson_id"],
        unique=False,
    )
    op.create_index(
        "ix_userdata_shadowing_bests_segment_id",
        "userdata_shadowing_bests",
        ["user_id", "segment_id"],
        unique=False,
    )
    op.create_index(
        "ix_userdata_spaced_repetition_due_date",
        "userdata_spaced_repetition",
        ["user_id", "due_date"],
        unique=False,
    )
    op.create_index(
        "ix_userdata_speak_sessions_started_at",
        "userdata_speak_sessions",
        ["user_id", "started_at"],
        unique=False,
    )
    op.create_index(
        "ix_userdata_threads_owner_id",
        "userdata_threads",
        ["user_id", "owner_id"],
        unique=False,
    )
    op.create_index(
        "ix_userdata_threads_surface",
        "userdata_threads",
        ["user_id", "surface"],
        unique=False,
    )
    op.create_index(
        "ix_userdata_threads_updated_at_ms",
        "userdata_threads",
        ["user_id", "updated_at_ms"],
        unique=False,
    )
    op.create_index(
        "ix_userdata_tip_notes_video_id",
        "userdata_tip_notes",
        ["user_id", "video_id"],
        unique=False,
    )
    op.create_index(
        "ix_userdata_tip_progress_course_id",
        "userdata_tip_progress",
        ["user_id", "course_id"],
        unique=False,
    )
    op.create_index(
        "ix_userdata_tip_progress_video_id",
        "userdata_tip_progress",
        ["user_id", "video_id"],
        unique=False,
    )
    op.create_index(
        "ix_userdata_user_materials_external_id",
        "userdata_user_materials",
        ["user_id", "external_id"],
        unique=True,
    )
    op.create_index(
        "ix_userdata_user_materials_skill",
        "userdata_user_materials",
        ["user_id", "skill"],
        unique=False,
    )
    op.create_index(
        "ix_userdata_vocabulary_created_at",
        "userdata_vocabulary",
        ["user_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_userdata_vocabulary_source_lesson_id",
        "userdata_vocabulary",
        ["user_id", "source_lesson_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("userdata_vocabulary")
    op.drop_table("userdata_user_materials")
    op.drop_table("userdata_tip_progress")
    op.drop_table("userdata_tip_notes")
    op.drop_table("userdata_threads")
    op.drop_table("userdata_thread_summaries")
    op.drop_table("userdata_speak_sessions")
    op.drop_table("userdata_speak_custom_situations")
    op.drop_table("userdata_spaced_repetition")
    op.drop_table("userdata_shadowing_bests")
    op.drop_table("userdata_settings")
    op.drop_table("userdata_session_logs")
    op.drop_table("userdata_progress_db")
    op.drop_table("userdata_mistakes_db")
    op.drop_table("userdata_mastery_db")
    op.drop_table("userdata_learner_profile")
    op.drop_table("userdata_import_digests")
    op.drop_table("userdata_exercise_stats")
    op.drop_table("userdata_daily_tasks")
    op.drop_table("userdata_agent_memory")
