import hashlib
import json
import uuid
from typing import Literal

from sqlalchemy import ColumnElement, delete, func, select, update
from sqlalchemy.dialects.postgresql import JSONB, insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.userdata.merge import Data, union
from app.userdata.models import TABLES, import_digests
from app.userdata.specs import IndexedField, StoreSpec

Op = Literal["eq", "lte"]


def index_filter(spec: StoreSpec, field: IndexedField, value: str, op: Op) -> ColumnElement[bool]:
    column = TABLES[spec.name].c[field.column]
    if field.type is JSONB:
        return column.contains([value])
    typed = field.type().python_type(value)
    return column <= typed if op == "lte" else column == typed


async def list_records(
    session: AsyncSession, user_id: uuid.UUID, spec: StoreSpec, where: ColumnElement[bool] | None = None
) -> list[Data]:
    table = TABLES[spec.name]
    stmt = select(table.c.data).where(table.c.user_id == user_id).order_by(table.c.id)
    if where is not None:
        stmt = stmt.where(where)
    return list(await session.scalars(stmt))


async def get_record(session: AsyncSession, user_id: uuid.UUID, spec: StoreSpec, record_id: str) -> Data | None:
    table = TABLES[spec.name]
    return await session.scalar(select(table.c.data).where(table.c.user_id == user_id, table.c.id == record_id))


async def get_versioned(
    session: AsyncSession, user_id: uuid.UUID, spec: StoreSpec, record_id: str
) -> tuple[Data, int] | None:
    table = TABLES[spec.name]
    row = await session.execute(
        select(table.c.data, table.c.version).where(table.c.user_id == user_id, table.c.id == record_id)
    )
    found = row.first()
    return (found.data, found.version) if found else None


async def create_record(session: AsyncSession, user_id: uuid.UUID, spec: StoreSpec, data: Data) -> int | None:
    """Insert only when the id is free; return the new version, or None when a row already exists."""
    stmt = insert(TABLES[spec.name]).on_conflict_do_nothing().returning(TABLES[spec.name].c.version)
    return await session.scalar(stmt, [_row(spec, user_id, data)])


async def swap_record(
    session: AsyncSession, user_id: uuid.UUID, spec: StoreSpec, data: Data, expected: int
) -> int | None:
    """Replace the row only at version `expected`; return the new version, or None on a version mismatch."""
    table = TABLES[spec.name]
    row = _row(spec, user_id, data)
    stmt = (
        update(table)
        .where(table.c.user_id == user_id, table.c.id == row["id"], table.c.version == expected)
        .values(
            data=data,
            version=table.c.version + 1,
            updated_at=func.now(),
            **{field.column: row[field.column] for field in spec.indexed},
        )
        .returning(table.c.version)
    )
    return await session.scalar(stmt)


async def delete_records(session: AsyncSession, user_id: uuid.UUID, spec: StoreSpec, where: ColumnElement[bool]) -> int:
    table = TABLES[spec.name]
    result = await session.execute(delete(table).where(table.c.user_id == user_id, where))
    return result.rowcount


def id_filter(spec: StoreSpec, record_id: str) -> ColumnElement[bool]:
    return TABLES[spec.name].c.id == record_id


def version_filter(spec: StoreSpec, version: int) -> ColumnElement[bool]:
    return TABLES[spec.name].c.version == version


def _row(spec: StoreSpec, user_id: uuid.UUID, data: Data) -> Data:
    return {
        "user_id": user_id,
        "id": spec.record_id(data),
        "data": data,
        **{field.column: data.get(field.json_path) for field in spec.indexed},
    }


async def replace_records(session: AsyncSession, user_id: uuid.UUID, spec: StoreSpec, records: list[Data]) -> None:
    rows = list({row["id"]: row for row in (_row(spec, user_id, data) for data in records)}.values())
    if not rows:
        return
    stmt = insert(TABLES[spec.name])
    columns = ["data", *(field.column for field in spec.indexed)]
    stmt = stmt.on_conflict_do_update(
        index_elements=["user_id", "id"],
        set_={
            **{column: stmt.excluded[column] for column in columns},
            "updated_at": func.now(),
            "version": TABLES[spec.name].c.version + 1,
        },
    )
    await session.execute(stmt, rows)


def _digest(data: Data) -> str:
    canonical = json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


async def _unmerged(session: AsyncSession, user_id: uuid.UUID, spec: StoreSpec, records: list[Data]) -> list[Data]:
    by_digest = {_digest(data): data for data in records}
    inserted = await session.scalars(
        insert(import_digests).on_conflict_do_nothing().returning(import_digests.c.digest),
        [{"user_id": user_id, "store": spec.name, "digest": digest} for digest in by_digest],
    )
    fresh = set(inserted)
    return [data for digest, data in by_digest.items() if digest in fresh]


async def import_records(
    session: AsyncSession, user_id: uuid.UUID, spec: StoreSpec, records: list[Data]
) -> list[Data] | None:
    table = TABLES[spec.name]
    if spec.merge is union:
        await session.execute(insert(table).on_conflict_do_nothing(), [_row(spec, user_id, data) for data in records])
        return None

    await session.execute(select(func.pg_advisory_xact_lock(func.hashtext(f"{user_id}:{spec.name}"))))
    ids = list(dict.fromkeys(spec.record_id(data) for data in records))
    stored = dict(
        (await session.execute(select(table.c.id, table.c.data).where(table.c.user_id == user_id, table.c.id.in_(ids))))
        .tuples()
        .all()
    )
    touched = set()
    for data in await _unmerged(session, user_id, spec, records):
        record_id = spec.record_id(data)
        stored[record_id] = spec.merge(stored[record_id], data) if record_id in stored else data
        touched.add(record_id)
    await replace_records(session, user_id, spec, [stored[record_id] for record_id in touched])
    return [stored[record_id] for record_id in ids]
