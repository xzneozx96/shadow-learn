from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    PrimaryKeyConstraint,
    Table,
    Text,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB

from app.accounts.models import User
from app.db import Base
from app.userdata.specs import STORES, StoreSpec


def _user_id() -> Column:
    return Column("user_id", Uuid, ForeignKey(User.id, ondelete="CASCADE"), nullable=False)


def build_table(spec: StoreSpec) -> Table:
    table = Table(
        spec.table,
        Base.metadata,
        _user_id(),
        Column("id", Text, nullable=False),
        Column("data", JSONB, nullable=False),
        Column("updated_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
        *(Column(field.column, field.type, nullable=True) for field in spec.indexed),
        PrimaryKeyConstraint("user_id", "id"),
    )
    for field in spec.indexed:
        name = f"ix_{spec.table}_{field.column}"
        if field.type is JSONB:
            Index(name, table.c[field.column], postgresql_using="gin")
        else:
            Index(name, table.c.user_id, table.c[field.column], unique=field.unique)
    return table


TABLES: dict[str, Table] = {name: build_table(spec) for name, spec in STORES.items()}

import_digests = Table(
    "userdata_import_digests",
    Base.metadata,
    _user_id(),
    Column("store", Text, nullable=False),
    Column("digest", Text, nullable=False),
    PrimaryKeyConstraint("user_id", "store", "digest"),
)
