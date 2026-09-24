"""lesson row versions

Revision ID: 0008_lesson_versions
Revises: 0007_import_quarantine
Create Date: 2026-09-24

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0008_lesson_versions"
down_revision: str | Sequence[str] | None = "0007_import_quarantine"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("lessons", sa.Column("version", sa.BigInteger(), server_default="1", nullable=False))


def downgrade() -> None:
    op.drop_column("lessons", "version")
