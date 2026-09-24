from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import (
    APIRouter,
    Body,
    Depends,
    Header,
    HTTPException,
    Query,
    Response,
    status,
)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.deps import CurrentUser
from app.db import get_session
from app.userdata import repository
from app.userdata.repository import Op
from app.userdata.schemas import BulkRequest, BulkResponse
from app.userdata.specs import STORES, StoreSpec

router = APIRouter(prefix="/api/store", tags=["store"])

Session = Annotated[AsyncSession, Depends(get_session)]


def _spec(store: str) -> StoreSpec:
    spec = STORES.get(store)
    if spec is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="unknown store")
    return spec


def _writable_spec(spec: Annotated[StoreSpec, Depends(_spec)]) -> StoreSpec:
    if not spec.client_writable:
        raise HTTPException(status_code=status.HTTP_405_METHOD_NOT_ALLOWED, detail="store is read-only")
    return spec


Spec = Annotated[StoreSpec, Depends(_spec)]
WritableSpec = Annotated[StoreSpec, Depends(_writable_spec)]


def _index_filter(spec: StoreSpec, index: str, value: str, op: Op):
    field = spec.index_field(index)
    if field is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unknown index")
    try:
        return repository.index_filter(spec, field, value, op)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="bad index value") from e


def _errors_at(error: ValidationError, loc: tuple[str | int, ...]) -> list[dict[str, Any]]:
    return [{**detail, "loc": (*loc, *detail["loc"])} for detail in error.errors(include_url=False)]


@asynccontextmanager
async def _unique_conflict_as_409() -> AsyncIterator[None]:
    try:
        yield
    except IntegrityError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="record conflicts with a unique index") from e


IfMatch = Annotated[str | None, Header()]


def _etag(version: int) -> str:
    return f'"{version}"'


def _expected_version(if_match: str) -> int:
    try:
        return int(if_match.removeprefix("W/").strip('"'))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="bad If-Match version") from e


async def _version_conflict(session: AsyncSession, user_id, spec: StoreSpec, record_id: str) -> JSONResponse:
    current = await repository.get_versioned(session, user_id, spec, record_id)
    headers = {"ETag": _etag(current[1])} if current else {}
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": "version conflict", "record": current[0] if current else None},
        headers=headers,
    )


@router.get("/{store}")
async def list_records(
    spec: Spec,
    user: CurrentUser,
    session: Session,
    index: str | None = None,
    value: str | None = None,
    op: Op = "eq",
) -> list[dict[str, Any]]:
    if (index is None) != (value is None):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="index and value go together")
    where = _index_filter(spec, index, value, op) if index is not None else None
    return await repository.list_records(session, user.id, spec, where)


@router.get("/{store}/{record_id}")
async def get_record(
    spec: Spec, record_id: str, user: CurrentUser, session: Session, response: Response
) -> dict[str, Any]:
    found = await repository.get_versioned(session, user.id, spec, record_id)
    if found is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="record not found")
    response.headers["ETag"] = _etag(found[1])
    return found[0]


@router.put("/{store}/{record_id}")
async def put_record(
    spec: WritableSpec,
    record_id: str,
    user: CurrentUser,
    session: Session,
    record: Annotated[Any, Body()],
    response: Response,
    if_match: IfMatch = None,
    if_none_match: IfMatch = None,
) -> Any:
    try:
        data = spec.validate(record)
    except ValidationError as e:
        raise RequestValidationError(_errors_at(e, ("body",))) from e
    if spec.record_id(data) != record_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="record id does not match the path")
    async with _unique_conflict_as_409():
        if if_match is not None:
            version = await repository.swap_record(session, user.id, spec, data, _expected_version(if_match))
        elif if_none_match == "*":
            version = await repository.create_record(session, user.id, spec, data)
        else:
            await repository.replace_records(session, user.id, spec, [data])
            version = (await repository.get_versioned(session, user.id, spec, record_id))[1]
        if version is None:
            await session.rollback()
            return await _version_conflict(session, user.id, spec, record_id)
        await session.commit()
    response.headers["ETag"] = _etag(version)
    return data


@router.delete("/{store}/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_record(
    spec: WritableSpec, record_id: str, user: CurrentUser, session: Session, if_match: IfMatch = None
) -> Response:
    where = repository.id_filter(spec, record_id)
    if if_match is not None:
        where = where & repository.version_filter(spec, _expected_version(if_match))
    deleted = await repository.delete_records(session, user.id, spec, where)
    if if_match is not None and deleted == 0:
        await session.rollback()
        return await _version_conflict(session, user.id, spec, record_id)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{store}")
async def delete_by_index(
    spec: WritableSpec,
    user: CurrentUser,
    session: Session,
    index: Annotated[str, Query()],
    value: Annotated[str, Query()],
) -> dict[str, int]:
    deleted = await repository.delete_records(session, user.id, spec, _index_filter(spec, index, value, "eq"))
    await session.commit()
    return {"deleted": deleted}


@router.post("/{store}/bulk")
async def bulk(spec: WritableSpec, body: BulkRequest, user: CurrentUser, session: Session) -> BulkResponse:
    records, errors = [], []
    for position, raw in enumerate(body.records):
        try:
            records.append(spec.validate(raw))
        except ValidationError as e:
            errors += _errors_at(e, ("body", "records", position))
    if errors:
        raise RequestValidationError(errors)
    after = None
    async with _unique_conflict_as_409():
        if records and body.mode == "import":
            after = await repository.import_records(session, user.id, spec, records)
        elif records:
            await repository.replace_records(session, user.id, spec, records)
        await session.commit()
    return BulkResponse(count=len(records), after=after)
