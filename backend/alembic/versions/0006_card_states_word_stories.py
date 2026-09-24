"""tip card states, word stories, and userdata row versions

Revision ID: 0006_card_states_word_stories
Revises: 0005_lessons_media_jobs_catalog
Create Date: 2026-09-24

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0006_card_states_word_stories"
down_revision: str | Sequence[str] | None = "0005_lessons_media_jobs_catalog"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _create(table: str) -> None:
    op.create_table(
        table,
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("version", sa.BigInteger(), server_default="1", nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "id"),
    )


EXISTING = (
    "agent_memory",
    "daily_tasks",
    "exercise_stats",
    "learner_profile",
    "mastery_db",
    "mistakes_db",
    "progress_db",
    "session_logs",
    "settings",
    "shadowing_bests",
    "spaced_repetition",
    "speak_custom_situations",
    "speak_sessions",
    "thread_summaries",
    "threads",
    "tip_notes",
    "tip_progress",
    "user_materials",
    "vocabulary",
)


def upgrade() -> None:
    for name in EXISTING:
        op.add_column(f"userdata_{name}", sa.Column("version", sa.BigInteger(), server_default="1", nullable=False))
    _create("userdata_tip_card_states")
    _create("userdata_word_stories")


def downgrade() -> None:
    for name in EXISTING:
        op.drop_column(f"userdata_{name}", "version")
    op.drop_table("userdata_word_stories")
    op.drop_table("userdata_tip_card_states")
