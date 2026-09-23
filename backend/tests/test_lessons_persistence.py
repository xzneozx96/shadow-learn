import hashlib
import io
import re
import uuid
import wave
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.accounts.models import User
from app.job_store import get_job
from app.lessons.models import Lesson, LessonSegment
from app.main import app
from app.media.models import MediaKind, MediaObject
from app.settings import settings

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.usefixtures("provider_env", "app_s3")]

_VTT = """WEBVTT

00:00:01.000 --> 00:00:03.000
你好世界

00:00:04.000 --> 00:00:06.500
我们学习中文
"""
_VIDEO_BYTES = b"\x00\x00\x00\x18ftypmp42" + bytes(range(256)) * 64
_MEDIA_URL = re.compile(r"^/api/media/([0-9a-f-]{36})\?token=[\w.-]+$")


def _translated(segments, languages, api_key, source_language):
    return [{**seg, "translations": {"en": f"en:{seg['text']}"}} for seg in segments]


@pytest.fixture(autouse=True)
def stt(monkeypatch):
    provider = AsyncMock()
    provider.transcribe = AsyncMock(return_value=[{"id": 0, "start": 0.0, "end": 1.0, "text": "你好"}])
    monkeypatch.setattr(app.state, "stt_provider", provider, raising=False)
    monkeypatch.setattr(app.state, "stt_provider_name", "deepgram", raising=False)
    return provider


@pytest.fixture
def temp_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "temp_dir", str(tmp_path))
    return tmp_path


@pytest.fixture
def mocked_youtube(temp_dir):
    async def download(video_id):
        path = temp_dir / f"{uuid.uuid4()}.mp4"
        path.write_bytes(_VIDEO_BYTES)
        return path

    with (
        patch(
            "app.lessons.router.get_youtube_metadata",
            new=AsyncMock(return_value={"duration": 7.0, "subtitles": {"zh-Hans": [{"ext": "vtt"}]}}),
        ),
        patch("app.lessons.router.download_subtitle_vtt", new=AsyncMock(return_value=_VTT)),
        patch("app.lessons.router.download_youtube_video", new=download),
        patch("app.lessons.router.translate_segments", new=AsyncMock(side_effect=_translated)),
        patch("app.lessons.router.enrich_vocabulary", new=AsyncMock(return_value={})),
    ):
        yield


async def _youtube_lesson(client) -> dict:
    response = await client.post(
        "/api/lessons/generate",
        json={"source": "youtube", "youtube_url": "https://www.youtube.com/watch?v=aaaaaaaaaaa", "translation_languages": ["en"]},
    )
    assert response.status_code == 200, response.text
    job = await get_job(response.json()["job_id"])
    assert job.status == "complete", job.error
    return job.result


@pytest.mark.usefixtures("mocked_youtube")
async def test_youtube_pipeline_persists_the_lesson_segments_and_video(client, stored_user, db_session, app_s3, temp_dir):
    result = await _youtube_lesson(client)

    assert set(result) == {"lesson", "video_url"}
    assert set(result["lesson"]) == {"id", "title", "source", "source_url", "duration", "segments", "translation_languages"}
    lesson_id = uuid.UUID(result["lesson"]["id"])
    lesson = await db_session.get(Lesson, lesson_id)
    assert (lesson.user_id, lesson.source, lesson.duration_s, lesson.translation_languages) == (
        stored_user.id, "youtube", 7.0, ["en"]
    )
    assert lesson.source_url == "https://www.youtube.com/watch?v=aaaaaaaaaaa"
    assert lesson.meta == {}

    rows = (
        await db_session.scalars(
            select(LessonSegment).where(LessonSegment.lesson_id == lesson_id).order_by(LessonSegment.position)
        )
    ).all()
    assert [row.position for row in rows] == [0, 1]
    assert [row.data for row in rows] == result["lesson"]["segments"]
    assert [row.data["text"] for row in rows] == ["你好世界", "我们学习中文"]
    assert [(row.start_s, row.end_s) for row in rows] == [(1.0, 3.0), (4.0, 6.5)]
    assert rows[0].data["translations"] == {"en": "en:你好世界"}

    media_id = uuid.UUID(_MEDIA_URL.match(result["video_url"]).group(1))
    media = await db_session.get(MediaObject, media_id)
    assert (media.kind, media.lesson_id, media.size) == (MediaKind.video, lesson_id, len(_VIDEO_BYTES))
    assert media.sha256 == hashlib.sha256(_VIDEO_BYTES).hexdigest()
    assert media.object_key == f"users/{stored_user.id}/lessons/{lesson_id}/video/{media_id}.mp4"
    stored = await app_s3.get_object(Bucket=settings.s3_bucket, Key=media.object_key)
    async with stored["Body"] as body:
        assert await body.read() == _VIDEO_BYTES

    streamed = await client.get(result["video_url"])
    assert streamed.status_code == 200
    assert streamed.content == _VIDEO_BYTES
    assert list(temp_dir.iterdir()) == []


def _wav(seconds: float = 1.0) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(8000)
        out.writeframes(b"\x00\x10" * int(8000 * seconds))
    return buffer.getvalue()


async def test_upload_pipeline_persists_audio_and_leaves_no_temp_files(client, stored_user, db_session, temp_dir):
    audio = _wav()

    async def extract(video_path):
        extracted = temp_dir / "extracted.mp3"
        extracted.write_bytes(b"mp3")
        return extracted

    with (
        patch("app.lessons.router.probe_upload_duration", new=AsyncMock(return_value=1.0)),
        patch("app.lessons.router.extract_audio_from_upload", new=extract),
        patch("app.lessons.router.translate_segments", new=AsyncMock(side_effect=_translated)),
        patch("app.lessons.router.enrich_vocabulary", new=AsyncMock(return_value={})),
    ):
        response = await client.post(
            "/api/lessons/generate-upload",
            files={"file": ("greeting.wav", io.BytesIO(audio), "audio/wav")},
            data={"translation_languages": "en"},
        )

    job = await get_job(response.json()["job_id"])
    assert job.status == "complete", job.error
    assert set(job.result) == {"lesson", "audio_url"}
    assert job.result["lesson"]["title"] == "greeting"
    media = await db_session.get(MediaObject, uuid.UUID(_MEDIA_URL.match(job.result["audio_url"]).group(1)))
    assert (media.kind, media.content_type, media.sha256) == (
        MediaKind.audio, "audio/wav", hashlib.sha256(audio).hexdigest()
    )
    assert list(temp_dir.iterdir()) == []


async def test_failed_pipeline_stores_nothing_and_leaves_no_temp_files(
    client, stored_user, db_session, app_s3, temp_dir, mocked_youtube
):
    with patch("app.lessons.router.translate_segments", new=AsyncMock(side_effect=RuntimeError("openrouter down"))):
        response = await client.post(
            "/api/lessons/generate",
            json={"source": "youtube", "youtube_url": "https://www.youtube.com/watch?v=aaaaaaaaaaa", "translation_languages": ["en"]},
        )

    job = await get_job(response.json()["job_id"])
    assert (job.status, job.error) == ("error", "openrouter down")
    assert (await db_session.scalars(select(Lesson))).all() == []
    listing = await app_s3.list_objects_v2(Bucket=settings.s3_bucket, Prefix=f"users/{stored_user.id}/")
    assert "Contents" not in listing
    assert list(temp_dir.iterdir()) == []


@pytest_asyncio.fixture(loop_scope="session")
async def stranger_lesson(db_session):
    stranger = User(id=uuid.uuid4(), email=f"s-{uuid.uuid4().hex[:6]}@example.com", hashed_password="", is_active=True)
    db_session.add(stranger)
    await db_session.flush()
    lesson = Lesson(
        user_id=stranger.id, title="theirs", source="upload", duration_s=1.0, source_language="zh-CN", translation_languages=[]
    )
    db_session.add(lesson)
    await db_session.commit()
    return lesson


@pytest.mark.usefixtures("mocked_youtube")
async def test_list_and_get_return_only_the_callers_lessons(client, stored_user, stranger_lesson):
    result = await _youtube_lesson(client)
    lesson_id = result["lesson"]["id"]

    listed = await client.get("/api/lessons")
    detail = await client.get(f"/api/lessons/{lesson_id}")

    assert [(item["id"], item["segment_count"]) for item in listed.json()] == [(lesson_id, 2)]
    body = detail.json()
    assert body["segments"] == result["lesson"]["segments"]
    assert body["title"] == result["lesson"]["title"]
    assert _MEDIA_URL.match(body["video_url"])
    assert (await client.get(body["video_url"])).content == _VIDEO_BYTES
    assert (await client.get(f"/api/lessons/{stranger_lesson.id}")).status_code == 404


@pytest.mark.usefixtures("mocked_youtube")
async def test_patch_replaces_meta_as_sent_and_sets_last_opened_at(client, stored_user):
    lesson_id = (await _youtube_lesson(client))["lesson"]["id"]
    first = {"id": lesson_id, "tags": ["a"], "progressSegmentId": "3", "nested": {"keep": 1}}

    await client.patch(f"/api/lessons/{lesson_id}", json={"meta": first})
    patched = await client.patch(
        f"/api/lessons/{lesson_id}", json={"meta": {"tags": []}, "last_opened_at": "2026-09-23T10:00:00Z"}
    )

    assert patched.status_code == 200
    assert patched.json()["meta"] == {"tags": []}
    assert patched.json()["last_opened_at"] == "2026-09-23T10:00:00+00:00"
    assert (await client.get(f"/api/lessons/{lesson_id}")).json()["meta"] == {"tags": []}


async def test_patch_rejects_server_owned_fields(client, stored_user, stranger_lesson):
    response = await client.patch(f"/api/lessons/{stranger_lesson.id}", json={"title": "x"})
    assert response.status_code == 422


async def test_patch_and_delete_of_another_users_lesson_are_404(client, stored_user, stranger_lesson):
    assert (await client.patch(f"/api/lessons/{stranger_lesson.id}", json={"meta": {}})).status_code == 404
    assert (await client.delete(f"/api/lessons/{stranger_lesson.id}")).status_code == 404


@pytest.mark.usefixtures("mocked_youtube")
async def test_delete_removes_rows_media_and_objects(client, stored_user, db_session, app_s3):
    lesson_id = (await _youtube_lesson(client))["lesson"]["id"]
    await client.put(
        f"/api/lessons/{lesson_id}/segments/0/shadowing-audio", content=b"rec", headers={"Content-Type": "audio/wav"}
    )
    prefix = f"users/{stored_user.id}/lessons/{lesson_id}/"
    before = await app_s3.list_objects_v2(Bucket=settings.s3_bucket, Prefix=prefix)

    deleted = await client.delete(f"/api/lessons/{lesson_id}")

    after = await app_s3.list_objects_v2(Bucket=settings.s3_bucket, Prefix=prefix)
    assert len(before["Contents"]) == 2
    assert deleted.status_code == 204
    assert (await client.get(f"/api/lessons/{lesson_id}")).status_code == 404
    assert "Contents" not in after
    assert (await db_session.scalars(select(MediaObject))).all() == []
    assert (await db_session.scalars(select(LessonSegment))).all() == []
