"""import quarantine

Revision ID: 0007_import_quarantine
Revises: 0006_card_states_word_stories
Create Date: 2026-09-24

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0007_import_quarantine"
down_revision: str | Sequence[str] | None = "0006_card_states_word_stories"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "import_quarantine",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("store", sa.Text(), nullable=False),
        sa.Column("record_id", sa.Text(), nullable=False),
        sa.Column("raw", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("error", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "source", "store", "record_id"),
    )
    op.create_table(
        "userdata_import_snapshots",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("store", sa.Text(), nullable=False),
        sa.Column("record_id", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("version", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "source", "store", "record_id"),
    )
    for column in ("import_source", "import_sent_hash", "import_row_hash"):
        op.add_column("lessons", sa.Column(column, sa.Text(), nullable=True))


def downgrade() -> None:
    for column in ("import_source", "import_sent_hash", "import_row_hash"):
        op.drop_column("lessons", column)
    op.drop_table("userdata_import_snapshots")
    op.drop_table("import_quarantine")
