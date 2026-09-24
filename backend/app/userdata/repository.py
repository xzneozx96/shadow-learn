import hashlib
import json
import uuid
from typing import Literal

from sqlalchemy import ColumnElement, delete, func, select, update
from sqlalchemy.dialects.postgresql import JSONB, insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.userdata.merge import DELTAS, Data, keep_server, union
from app.userdata.models import TABLES, import_digests, import_snapshots
from app.userdata.specs import IndexedField, StoreSpec

Op = Literal["eq", "lte"]
Outcome = Literal["stored", "merged", "kept_server", "conflict"]


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


def _digest(spec: StoreSpec, data: Data, source: str | None) -> str:
    if source is not None:
        return hashlib.sha256(f"{source}\0{spec.record_id(data)}".encode()).hexdigest()
    canonical = json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


async def _unmerged(
    session: AsyncSession, user_id: uuid.UUID, spec: StoreSpec, records: list[Data], source: str | None
) -> list[Data]:
    by_digest = {_digest(spec, data, source): data for data in records}
    inserted = await session.scalars(
        insert(import_digests).on_conflict_do_nothing().returning(import_digests.c.digest),
        [{"user_id": user_id, "store": spec.name, "digest": digest} for digest in by_digest],
    )
    fresh = set(inserted)
    return [data for digest, data in by_digest.items() if digest in fresh]


async def _stored(session: AsyncSession, user_id: uuid.UUID, spec: StoreSpec, ids: list[str]) -> dict[str, Data]:
    table = TABLES[spec.name]
    rows = await session.execute(select(table.c.id, table.c.data).where(table.c.user_id == user_id, table.c.id.in_(ids)))
    return dict(rows.tuples().all())


async def _versions(session: AsyncSession, user_id: uuid.UUID, spec: StoreSpec, ids: list[str]) -> dict[str, int]:
    table = TABLES[spec.name]
    rows = await session.execute(select(table.c.id, table.c.version).where(table.c.user_id == user_id, table.c.id.in_(ids)))
    return dict(rows.tuples().all())


def _outcome(spec: StoreSpec, version_before: int | None, merged_now: bool, written_by_source: bool) -> Outcome:
    if version_before is None or (written_by_source and version_before == 1 and not merged_now):
        return "stored"
    if spec.merge is union or spec.merge is keep_server:
        return "kept_server"
    return "merged"


async def _snapshots(
    session: AsyncSession, user_id: uuid.UUID, source: str, spec: StoreSpec, ids: list[str]
) -> dict[str, tuple[Data, int]]:
    rows = await session.execute(
        select(import_snapshots.c.record_id, import_snapshots.c.data, import_snapshots.c.version).where(
            import_snapshots.c.user_id == user_id,
            import_snapshots.c.source == source,
            import_snapshots.c.store == spec.name,
            import_snapshots.c.record_id.in_(ids),
        )
    )
    return {record_id: (data, version) for record_id, data, version in rows}


async def _import_from_source(
    session: AsyncSession, user_id: uuid.UUID, spec: StoreSpec, records: list[Data], source: str
) -> tuple[list[Data], dict[str, Outcome]]:
    """Import one device's records, converging however often it resends, even with newer content.

    A snapshot per (source, record) holds what this device last sent and the row
    version it left. Counting rules merge only the change since that snapshot, so a
    retry never counts twice. Idempotent rules merge again as is. Union and
    keep-server records take the device's newer copy only while the account has
    not edited the row since; when both changed, the outcome is ``conflict``.
    """
    rule = spec.merge
    incoming = {spec.record_id(data): data for data in records}
    ids = list(incoming)
    await session.execute(select(func.pg_advisory_xact_lock(func.hashtext(f"{user_id}:{spec.name}"))))
    stored = await _stored(session, user_id, spec, ids)
    versions = await _versions(session, user_id, spec, ids)
    snapshots = await _snapshots(session, user_id, source, spec, ids)
    writes: dict[str, Data] = {}
    outcomes: dict[str, Outcome] = {}
    ours: set[str] = set()
    for record_id, data in incoming.items():
        row = stored.get(record_id)
        previous, version = snapshots.get(record_id, (None, None))
        untouched = previous is not None and versions.get(record_id) == version
        if row is None:
            writes[record_id], outcomes[record_id] = data, "stored"
        elif rule is union or rule is keep_server:
            if row == data or untouched:
                writes[record_id], outcomes[record_id] = data, "stored"
            elif previous is None or previous == data:
                outcomes[record_id] = "kept_server"
                continue
            else:
                outcomes[record_id] = "conflict"
                continue
        elif rule in DELTAS:
            if previous is None:
                writes[record_id], outcomes[record_id] = rule(row, data), "merged"
            elif previous != data:
                writes[record_id], outcomes[record_id] = rule(row, DELTAS[rule](data, previous)), "merged"
            else:
                outcomes[record_id] = "stored" if untouched and row == data else "merged"
        else:
            merged = rule(row, data)
            if merged != row:
                writes[record_id] = merged
            outcomes[record_id] = "stored" if merged == data else "merged"
        ours.add(record_id)
    await replace_records(session, user_id, spec, [writes[record_id] for record_id in writes if writes[record_id] != stored.get(record_id)])
    after = await _stored(session, user_id, spec, ids)
    if ours:
        now = await _versions(session, user_id, spec, list(ours))
        stmt = insert(import_snapshots)
        await session.execute(
            stmt.on_conflict_do_update(
                index_elements=["user_id", "source", "store", "record_id"],
                set_={"data": stmt.excluded.data, "version": stmt.excluded.version},
            ),
            [
                {"user_id": user_id, "source": source, "store": spec.name, "record_id": record_id, "data": incoming[record_id], "version": now[record_id]}
                for record_id in ours
            ],
        )
    return [after[record_id] for record_id in ids], outcomes


async def import_records(
    session: AsyncSession, user_id: uuid.UUID, spec: StoreSpec, records: list[Data], source: str | None = None
) -> tuple[list[Data], dict[str, Outcome]]:
    """Merge ``records`` into the caller's store; return the stored record and the outcome for every id."""
    if source is None:
        return await _import_by_content(session, user_id, spec, records, None)
    return await _import_from_source(session, user_id, spec, records, source)


async def _import_by_content(
    session: AsyncSession, user_id: uuid.UUID, spec: StoreSpec, records: list[Data], source: str | None
) -> tuple[list[Data], dict[str, Outcome]]:
    """The source-less path: an identical record merges once, and every distinct one counts."""
    table = TABLES[spec.name]
    ids = list(dict.fromkeys(spec.record_id(data) for data in records))
    if spec.merge is not union:
        await session.execute(select(func.pg_advisory_xact_lock(func.hashtext(f"{user_id}:{spec.name}"))))
    before = await _versions(session, user_id, spec, ids)
    fresh = await _unmerged(session, user_id, spec, records, source)
    fresh_ids = {spec.record_id(data) for data in fresh}

    if spec.merge is union:
        await session.execute(insert(table).on_conflict_do_nothing(), [_row(spec, user_id, data) for data in records])
        stored = await _stored(session, user_id, spec, ids)
        outcomes = {
            record_id: _outcome(spec, before.get(record_id), False, source is not None and record_id not in fresh_ids)
            for record_id in ids
            if record_id in stored
        }
        return [stored[record_id] for record_id in outcomes], outcomes

    stored = await _stored(session, user_id, spec, ids)
    vanished = [data for data in records if spec.record_id(data) not in stored.keys() | fresh_ids]
    touched: dict[str, int] = {}
    for data in [*fresh, *vanished]:
        record_id = spec.record_id(data)
        stored[record_id] = spec.merge(stored[record_id], data) if record_id in stored else data
        touched[record_id] = touched.get(record_id, 0) + 1
    await replace_records(session, user_id, spec, [stored[record_id] for record_id in touched])
    outcomes = {
        record_id: _outcome(
            spec,
            before.get(record_id),
            record_id in before and record_id in touched or touched.get(record_id, 0) > 1,
            record_id not in fresh_ids,
        )
        for record_id in ids
    }
    return [stored[record_id] for record_id in ids], outcomes
