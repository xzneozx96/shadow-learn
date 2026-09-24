import os
import subprocess
import sys

import pytest
import pytest_asyncio
from fastapi import Depends, FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.accounts.deps import current_active_user
from app.lessons.models import LessonSegment
from app.main import app
from app.media.models import MediaObject
from app.testing.router import router as seed_router

pytestmark = pytest.mark.asyncio(loop_scope="session")

SEED = {
    "title": "Seeded",
    "duration": 12.5,
    "meta": {"tags": ["e2e"]},
    "segments": [
        {"id": "s1", "start": 0, "end": 2, "text": "你好", "translations": {"en": "hi"}, "words": []},
        {"id": "s2", "start": 2, "end": 4, "text": "再见", "translations": {"en": "bye"}, "words": []},
    ],
}


def _mounted_with(flag: str) -> bool:
    probe = "import app.main as m; print(any(r.path == '/api/testing/lessons' for r in m.app.routes))"
    result = subprocess.run(
        [sys.executable, "-c", probe],
        env={**os.environ, "SHADOWLEARN_ENABLE_TEST_ROUTES": flag},
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip().splitlines()[-1] == "True"


async def test_main_mounts_the_route_only_when_the_flag_is_on():
    assert _mounted_with("true") is True
    assert _mounted_with("false") is False


async def test_route_is_404_when_the_flag_is_off(client, stored_user):
    res = await client.post("/api/testing/lessons", json=SEED)

    assert res.status_code == 404


@pytest_asyncio.fixture(loop_scope="session")
async def seeding_client(app_s3, signed_in_user):
    seeding = FastAPI()
    seeding.include_router(seed_router, dependencies=[Depends(current_active_user)])
    seeding.dependency_overrides = app.dependency_overrides
    seeding.state.s3 = app_s3
    async with AsyncClient(transport=ASGITransport(app=seeding), base_url="http://test") as http:
        yield http


async def test_seed_inserts_the_lesson_and_its_segments_for_the_caller(seeding_client, client, stored_user, db_session):
    seeded = await seeding_client.post("/api/testing/lessons", json=SEED)

    assert seeded.status_code == 201
    lesson_id = seeded.json()["id"]
    got = await client.get(f"/api/lessons/{lesson_id}")
    assert got.status_code == 200
    body = got.json()
    assert (body["title"], body["duration"], body["segment_count"], body["meta"]) == ("Seeded", 12.5, 2, {"tags": ["e2e"]})
    assert [s["text"] for s in body["segments"]] == ["你好", "再见"]
    rows = (await db_session.scalars(select(LessonSegment.position).where(LessonSegment.lesson_id == lesson_id))).all()
    assert sorted(rows) == [0, 1]


async def test_seed_media_attaches_a_streamable_video(seeding_client, client, stored_user, db_session):
    lesson_id = (await seeding_client.post("/api/testing/lessons", json=SEED)).json()["id"]
    video = os.urandom(4096)

    put = await seeding_client.put(
        f"/api/testing/lessons/{lesson_id}/media", content=video, headers={"Content-Type": "video/mp4"}
    )

    assert put.status_code == 200
    body = (await client.get(f"/api/lessons/{lesson_id}")).json()
    assert body["video_url"].startswith(f"/api/media/{put.json()['id']}?token=")
    streamed = await client.get(body["video_url"], headers={"Range": "bytes=0-99"})
    assert streamed.status_code == 206
    assert streamed.content == video[:100]
    [media] = (await db_session.scalars(select(MediaObject).where(MediaObject.lesson_id == lesson_id))).all()
    assert (media.kind, media.size) == ("video", len(video))


async def test_seed_media_rejects_an_unknown_type(seeding_client, stored_user):
    lesson_id = (await seeding_client.post("/api/testing/lessons", json=SEED)).json()["id"]

    put = await seeding_client.put(
        f"/api/testing/lessons/{lesson_id}/media", content=b"x", headers={"Content-Type": "text/plain"}
    )

    assert put.status_code == 415
