"""PUT and GET /api/lessons/{lesson_id}/segments/{segment_id}/shadowing-audio."""

import hashlib
import os
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.lessons.models import Lesson
from app.media.models import MediaKind, MediaObject
from app.settings import settings

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.usefixtures("app_s3")]


@pytest_asyncio.fixture(loop_scope="session")
async def lesson(stored_user, db_session):
    row = Lesson(
        user_id=stored_user.id, title="t", source="upload", duration_s=1.0, source_language="zh-CN", translation_languages=[]
    )
    db_session.add(row)
    await db_session.commit()
    return row


def _path(lesson_id, segment_id="s1") -> str:
    return f"/api/lessons/{lesson_id}/segments/{segment_id}/shadowing-audio"


async def _shadowing_rows(db_session) -> list[MediaObject]:
    result = await db_session.scalars(
        select(MediaObject).where(MediaObject.kind == MediaKind.shadowing).execution_options(populate_existing=True)
    )
    return result.all()


async def test_put_then_get_returns_identical_bytes_and_the_stored_sha256(client, lesson, db_session):
    recording = os.urandom(48_000)

    put = await client.put(_path(lesson.id), content=recording, headers={"Content-Type": "audio/wav"})
    got = await client.get(_path(lesson.id))

    assert put.status_code == 200
    assert got.status_code == 200
    assert got.content == recording
    assert got.headers["content-type"] == "audio/wav"
    [row] = await _shadowing_rows(db_session)
    assert row.sha256 == put.json()["sha256"] == hashlib.sha256(recording).hexdigest()
    assert (row.segment_id, row.size) == ("s1", len(recording))
    assert row.object_key == f"users/{lesson.user_id}/lessons/{lesson.id}/shadowing/{row.id}.wav"


async def test_second_put_replaces_the_recording_and_its_object(client, lesson, db_session, app_s3):
    await client.put(_path(lesson.id), content=b"first", headers={"Content-Type": "audio/webm"})
    [first] = await _shadowing_rows(db_session)

    await client.put(_path(lesson.id), content=b"second", headers={"Content-Type": "audio/webm;codecs=opus"})

    [second] = await _shadowing_rows(db_session)
    assert second.id != first.id
    assert (await client.get(_path(lesson.id))).content == b"second"
    listing = await app_s3.list_objects_v2(Bucket=settings.s3_bucket, Prefix=f"users/{lesson.user_id}/lessons/{lesson.id}/")
    assert [obj["Key"] for obj in listing["Contents"]] == [second.object_key]


async def test_recordings_are_keyed_per_segment(client, lesson):
    await client.put(_path(lesson.id, "s1"), content=b"one", headers={"Content-Type": "audio/wav"})
    await client.put(_path(lesson.id, "s2"), content=b"two", headers={"Content-Type": "audio/wav"})

    assert (await client.get(_path(lesson.id, "s1"))).content == b"one"
    assert (await client.get(_path(lesson.id, "s2"))).content == b"two"


async def test_missing_recording_is_404(client, lesson):
    assert (await client.get(_path(lesson.id))).status_code == 404


async def test_put_for_an_unknown_lesson_is_404(client, stored_user):
    response = await client.put(_path(uuid.uuid4()), content=b"x", headers={"Content-Type": "audio/wav"})
    assert response.status_code == 404


async def test_put_rejects_a_non_audio_body(client, lesson):
    response = await client.put(_path(lesson.id), content=b"x", headers={"Content-Type": "text/plain"})
    assert response.status_code == 415


async def test_put_rejects_an_empty_body(client, lesson, db_session):
    response = await client.put(_path(lesson.id), content=b"", headers={"Content-Type": "audio/wav"})
    assert response.status_code == 400
    assert await _shadowing_rows(db_session) == []
