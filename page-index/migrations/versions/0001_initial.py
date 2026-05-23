"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

processing_status = sa.Enum(
    "PENDING", "PROCESSING", "COMPLETED", "FAILED", name="processingstatus"
)


def upgrade() -> None:
    op.create_table(
        "documents",
        sa.Column("doc_id", sa.String(), nullable=False),
        sa.Column("original_filename", sa.String(), nullable=False),
        sa.Column("file_type", sa.String(), nullable=False),
        sa.Column("status", processing_status, nullable=True),
        sa.Column("retrieval_ready", sa.Boolean(), nullable=True),
        sa.Column("result_path", sa.String(), nullable=True),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("doc_id"),
    )
    op.create_index("ix_documents_status", "documents", ["status"])

    op.create_table(
        "retrievals",
        sa.Column("retrieval_id", sa.String(), nullable=False),
        sa.Column("doc_id", sa.String(), nullable=False),
        sa.Column("query", sa.String(), nullable=False),
        sa.Column("thinking", sa.Boolean(), nullable=True),
        sa.Column("status", processing_status, nullable=True),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["doc_id"], ["documents.doc_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("retrieval_id"),
    )
    op.create_index("ix_retrievals_doc_id", "retrievals", ["doc_id"])


def downgrade() -> None:
    op.drop_index("ix_retrievals_doc_id", table_name="retrievals")
    op.drop_table("retrievals")
    op.drop_index("ix_documents_status", table_name="documents")
    op.drop_table("documents")
    processing_status.drop(op.get_bind(), checkfirst=True)
