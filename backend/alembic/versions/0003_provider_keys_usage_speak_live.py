"""provider keys, provider usage, speak live sessions

Revision ID: 0003_provider_keys
Revises: 0002_users
Create Date: 2026-09-23

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003_provider_keys"
down_revision: str | Sequence[str] | None = "0002_users"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

provider = sa.Enum("openrouter", "azure_speech", "google", name="provider")
key_source = sa.Enum("user", "env", name="key_source")


def upgrade() -> None:
    op.create_table(
        "provider_keys",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("provider", provider, primary_key=True),
        sa.Column("ciphertext", sa.LargeBinary(), nullable=False),
        sa.Column("region", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "provider_usage",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", provider, nullable=False),
        sa.Column("source", key_source, nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_provider_usage_user_id", "provider_usage", ["user_id"])
    op.create_table(
        "speak_live_sessions",
        sa.Column("session_id", sa.Text(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_speak_live_sessions_user_id", "speak_live_sessions", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_speak_live_sessions_user_id", table_name="speak_live_sessions")
    op.drop_table("speak_live_sessions")
    op.drop_index("ix_provider_usage_user_id", table_name="provider_usage")
    op.drop_table("provider_usage")
    op.drop_table("provider_keys")
    key_source.drop(op.get_bind())
    provider.drop(op.get_bind())
