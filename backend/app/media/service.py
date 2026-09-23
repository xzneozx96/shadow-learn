import asyncio
import hashlib
import hmac
import re
import uuid
from collections.abc import AsyncIterator
from pathlib import Path

import jwt
from botocore.exceptions import ClientError
from fastapi import HTTPException
from fastapi.responses import Response, StreamingResponse
from fastapi_users.jwt import decode_jwt, generate_jwt

from app.media.models import MediaKind, MediaObject
from app.settings import settings

MEDIA_AUDIENCE = "shadowlearn:media"
_CHUNK_SIZE = 64 * 1024
_RANGE = re.compile(r"bytes=(\d*)-(\d*)")

CONTENT_TYPES = {
    "mp4": "video/mp4",
    "webm": "video/webm",
    "mkv": "video/x-matroska",
    "mov": "video/quicktime",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "m4a": "audio/mp4",
    "aac": "audio/aac",
    "flac": "audio/flac",
    "ogg": "audio/ogg",
    "opus": "audio/opus",
}


class RangeNotSatisfiable(Exception):
    pass


def content_type_for(path: Path) -> str:
    return CONTENT_TYPES.get(path.suffix.lstrip(".").lower(), "application/octet-stream")


def object_key(user_id: uuid.UUID, lesson_id: uuid.UUID, kind: MediaKind, media_id: uuid.UUID, ext: str) -> str:
    return f"users/{user_id}/lessons/{lesson_id}/{kind}/{media_id}.{ext}"


def _sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


async def put_file(s3, key: str, path: Path, content_type: str) -> tuple[int, str]:
    size = path.stat().st_size
    sha256 = await asyncio.to_thread(_sha256_of, path)
    with path.open("rb") as body:
        await s3.put_object(
            Bucket=settings.s3_bucket, Key=key, Body=body, ContentLength=size, ContentType=content_type
        )
    return size, sha256


async def upload_file(
    s3,
    *,
    user_id: uuid.UUID,
    kind: MediaKind,
    lesson_id: uuid.UUID,
    source_path: Path,
    segment_id: str | None = None,
) -> MediaObject:
    media_id = uuid.uuid4()
    content_type = content_type_for(source_path)
    key = object_key(user_id, lesson_id, kind, media_id, source_path.suffix.lstrip(".").lower() or "bin")
    size, sha256 = await put_file(s3, key, source_path, content_type)
    return MediaObject(
        id=media_id,
        user_id=user_id,
        kind=kind,
        lesson_id=lesson_id,
        segment_id=segment_id,
        object_key=key,
        size=size,
        sha256=sha256,
        content_type=content_type,
    )


async def store_file(
    s3,
    *,
    user_id: uuid.UUID,
    kind: MediaKind,
    lesson_id: uuid.UUID,
    source_path: Path,
    segment_id: str | None = None,
) -> MediaObject:
    try:
        return await upload_file(
            s3, user_id=user_id, kind=kind, lesson_id=lesson_id, source_path=source_path, segment_id=segment_id
        )
    finally:
        source_path.unlink(missing_ok=True)


async def delete_objects(s3, keys: list[str]) -> None:
    for key in keys:
        await s3.delete_object(Bucket=settings.s3_bucket, Key=key)


def parse_range(header: str | None, size: int) -> tuple[int, int] | None:
    """Return the inclusive byte range a single-range ``Range`` header asks for.

    ``None`` means serve the whole object: no header, a multi-range or
    malformed header, or an inverted range, all of which RFC 9110 lets a
    server ignore.
    """
    match = _RANGE.fullmatch(header.strip()) if header else None
    if match is None:
        return None
    first, last = match.groups()
    if not first and not last:
        return None
    if not first:
        suffix = int(last)
        if suffix == 0 or size == 0:
            raise RangeNotSatisfiable
        return max(size - suffix, 0), size - 1
    start = int(first)
    end = min(int(last), size - 1) if last else size - 1
    if start >= size:
        raise RangeNotSatisfiable
    if end < start:
        return None
    return start, end


async def _iter_body(body) -> AsyncIterator[bytes]:
    try:
        async for chunk in body.iter_chunks(_CHUNK_SIZE):
            yield chunk
    finally:
        await body.aclose()


async def stream(s3, media: MediaObject, range_header: str | None) -> Response:
    headers = {"Accept-Ranges": "bytes"}
    try:
        byte_range = parse_range(range_header, media.size)
    except RangeNotSatisfiable:
        return Response(status_code=416, headers={**headers, "Content-Range": f"bytes */{media.size}"})
    request = {"Bucket": settings.s3_bucket, "Key": media.object_key}
    if byte_range is None:
        status_code, length = 200, media.size
    else:
        start, end = byte_range
        request["Range"] = f"bytes={start}-{end}"
        headers["Content-Range"] = f"bytes {start}-{end}/{media.size}"
        status_code, length = 206, end - start + 1
    try:
        obj = await s3.get_object(**request)
    except ClientError as e:
        if e.response["Error"]["Code"] in {"NoSuchKey", "404"}:
            raise HTTPException(status_code=404, detail="Media not found") from None
        raise
    headers["Content-Length"] = str(length)
    return StreamingResponse(
        _iter_body(obj["Body"]), status_code=status_code, headers=headers, media_type=media.content_type
    )


def media_signing_key() -> str:
    return hmac.new(settings.jwt_secret.encode(), b"media-ticket", hashlib.sha256).hexdigest()


def mint_media_token(media_id: uuid.UUID) -> str:
    return generate_jwt(
        {"mid": str(media_id), "aud": [MEDIA_AUDIENCE]},
        media_signing_key(),
        settings.media_token_minutes * 60,
    )


def media_token_grants(token: str, media_id: uuid.UUID) -> bool:
    try:
        data = decode_jwt(token, media_signing_key(), [MEDIA_AUDIENCE])
    except jwt.PyJWTError:
        return False
    return data.get("mid") == str(media_id)


def media_url(media_id: uuid.UUID) -> str:
    return f"/api/media/{media_id}?token={mint_media_token(media_id)}"
