"""userdata stores

Revision ID: 0004_userdata_stores
Revises: 0002_users
Create Date: 2026-09-23

"""
from collections.abc import Sequence

import app.accounts.models  # noqa: F401
from alembic import op
from app.userdata.models import TABLES, import_digests

revision: str = "0004_userdata_stores"
down_revision: str | Sequence[str] | None = "0002_users"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    for table in (*TABLES.values(), import_digests):
        table.create(bind)


def downgrade() -> None:
    bind = op.get_bind()
    for table in (import_digests, *TABLES.values()):
        table.drop(bind)
