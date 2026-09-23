"""GET /api/media/{id}: Range streaming from MinIO and ticket or bearer authorization."""

import os
import uuid

import pytest
import pytest_asyncio
from fastapi_users.jwt import generate_jwt

from app.lessons.models import Lesson
from app.media.models import MediaKind
from app.media.service import MEDIA_AUDIENCE, mint_media_token, store_file
from app.settings import settings
from tests.conftest import register_and_login

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.real_auth]

SIZE = 1024 * 1024


@pytest_asyncio.fixture(loop_scope="session")
async def owner(client, db_session):
    return await register_and_login(client, f"owner-{uuid.uuid4().hex[:8]}@example.com")


@pytest_asyncio.fixture(loop_scope="session")
async def stranger(client, db_session):
    return await register_and_login(client, f"stranger-{uuid.uuid4().hex[:8]}@example.com")


@pytest_asyncio.fixture(loop_scope="session")
async def video(owner, db_session, app_s3, tmp_path):
    user_id = uuid.UUID(owner["id"])
    lesson = Lesson(
        user_id=user_id, title="t", source="upload", duration_s=1.0, source_language="zh-CN", translation_languages=[]
    )
    db_session.add(lesson)
    await db_session.flush()
    payload = os.urandom(SIZE)
    path = tmp_path / "clip.mp4"
    path.write_bytes(payload)
    media = await store_file(app_s3, user_id=user_id, kind=MediaKind.video, lesson_id=lesson.id, source_path=path)
    db_session.add(media)
    await db_session.commit()
    return media, payload


def _bearer(user) -> dict:
    return {"Authorization": f"Bearer {user['access_token']}"}


@pytest.mark.parametrize(
    ("range_header", "status", "content_range", "start", "end"),
    [
        (None, 200, None, 0, SIZE - 1),
        ("bytes=100-199", 206, f"bytes 100-199/{SIZE}", 100, 199),
        (f"bytes={SIZE - 576}-", 206, f"bytes {SIZE - 576}-{SIZE - 1}/{SIZE}", SIZE - 576, SIZE - 1),
        ("bytes=-500", 206, f"bytes {SIZE - 500}-{SIZE - 1}/{SIZE}", SIZE - 500, SIZE - 1),
        ("bytes=0-", 206, f"bytes 0-{SIZE - 1}/{SIZE}", 0, SIZE - 1),
        (f"bytes=100-{SIZE * 2}", 206, f"bytes 100-{SIZE - 1}/{SIZE}", 100, SIZE - 1),
    ],
)
async def test_range_table(client, video, range_header, status, content_range, start, end):
    media, payload = video
    headers = {"Range": range_header} if range_header else {}

    response = await client.get(f"/api/media/{media.id}", params={"token": mint_media_token(media.id)}, headers=headers)

    assert response.status_code == status
    assert response.headers.get("content-range") == content_range
    assert response.headers["accept-ranges"] == "bytes"
    assert response.headers["content-type"] == "video/mp4"
    assert int(response.headers["content-length"]) == end - start + 1
    assert response.content == payload[start : end + 1]


async def test_unsatisfiable_range_is_416(client, video):
    media, _ = video

    response = await client.get(
        f"/api/media/{media.id}",
        params={"token": mint_media_token(media.id)},
        headers={"Range": f"bytes={SIZE * 2}-"},
    )

    assert response.status_code == 416
    assert response.headers["content-range"] == f"bytes */{SIZE}"


async def test_missing_media_is_404(client, owner):
    missing = uuid.uuid4()
    response = await client.get(f"/api/media/{missing}", params={"token": mint_media_token(missing)})
    assert response.status_code == 404


async def test_missing_object_behind_a_row_is_404(client, video, app_s3):
    media, _ = video
    await app_s3.delete_object(Bucket=settings.s3_bucket, Key=media.object_key)

    response = await client.get(f"/api/media/{media.id}", params={"token": mint_media_token(media.id)})

    assert response.status_code == 404


async def test_ticket_for_another_media_id_is_401(client, video):
    media, _ = video
    response = await client.get(f"/api/media/{media.id}", params={"token": mint_media_token(uuid.uuid4())})
    assert response.status_code == 401


async def test_expired_ticket_is_401(client, video):
    media, _ = video
    expired = generate_jwt({"mid": str(media.id), "aud": [MEDIA_AUDIENCE]}, settings.jwt_secret, -60)

    response = await client.get(f"/api/media/{media.id}", params={"token": expired})

    assert response.status_code == 401


async def test_access_token_is_not_a_media_ticket(client, video, owner):
    media, _ = video
    response = await client.get(f"/api/media/{media.id}", params={"token": owner["access_token"]})
    assert response.status_code == 401


async def test_no_credentials_is_401(client, video):
    media, _ = video
    response = await client.get(f"/api/media/{media.id}")
    assert response.status_code == 401


async def test_owner_bearer_streams_without_a_ticket(client, video, owner):
    media, payload = video
    response = await client.get(f"/api/media/{media.id}", headers=_bearer(owner))
    assert response.status_code == 200
    assert response.content == payload


async def test_stranger_bearer_is_404_but_the_owner_ticket_is_the_capability(client, video, stranger):
    media, payload = video

    as_stranger = await client.get(f"/api/media/{media.id}", headers=_bearer(stranger))
    with_ticket = await client.get(
        f"/api/media/{media.id}", params={"token": mint_media_token(media.id)}, headers=_bearer(stranger)
    )

    assert as_stranger.status_code == 404
    assert with_ticket.status_code == 200
    assert with_ticket.content == payload


async def test_owner_mints_a_ticket_that_streams(client, video, owner):
    media, payload = video

    minted = await client.post(f"/api/media/{media.id}/ticket", headers=_bearer(owner))
    streamed = await client.get(minted.json()["url"])

    assert minted.status_code == 200
    assert minted.json()["expires_in"] == settings.media_token_minutes * 60
    assert streamed.status_code == 200
    assert streamed.content == payload


async def test_stranger_cannot_mint_a_ticket(client, video, stranger):
    media, _ = video
    response = await client.post(f"/api/media/{media.id}/ticket", headers=_bearer(stranger))
    assert response.status_code == 404
