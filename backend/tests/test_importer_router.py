import hashlib
import json
import os
import uuid
from pathlib import Path
from urllib.parse import quote

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.importer.canonical import store_hash
from app.media.models import MediaObject
from app.settings import settings
from tests.conftest import register_and_login

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.real_auth]

LESSON_ID = "6f1c2b1e-8d4f-4c1a-9a51-3f3d2c1b0a99"
SEGMENTS = [
    {"id": "s1", "start": 0, "end": 2.5, "text": "你好", "romanization": "nǐ hǎo", "translations": {"en": "hello"}, "words": []},
    {"id": "s2", "start": 2.5, "end": 5.25, "text": "谢谢", "romanization": "xiè xie", "translations": {}, "words": []},
]
LESSON = {
    "id": LESSON_ID,
    "title": "Renamed greeting",
    "source": "youtube",
    "sourceUrl": "https://youtu.be/abc",
    "duration": 5.25,
    "sourceLanguage": "zh-CN",
    "translationLanguages": ["en"],
    "createdAt": "2026-05-01T08:30:00.123Z",
    "lastOpenedAt": "2026-06-01T09:00:00.000Z",
    "meta": {"progressSegmentId": "s2", "tags": ["greetings"], "isDone": False},
}
PROFILE = {"name": "Ada", "totalSessions": 3, "totalStudyMinutes": 12, "profileCreated": "2026-01-01"}


def _bearer(user) -> dict:
    return {"Authorization": f"Bearer {user['access_token']}"}


@pytest_asyncio.fixture(loop_scope="session")
async def owner(client, db_session):
    return await register_and_login(client, f"owner-{uuid.uuid4().hex[:8]}@example.com")


@pytest_asyncio.fixture(loop_scope="session")
async def stranger(client, db_session):
    return await register_and_login(client, f"stranger-{uuid.uuid4().hex[:8]}@example.com")


async def _import_lesson(client, user, lesson=LESSON, segments=SEGMENTS):
    return await client.post(
        "/api/import/lessons", json={"lessons": [{**lesson, "segments": segments}]}, headers=_bearer(user)
    )


async def _manifest(client, user, body):
    response = await client.post("/api/import/manifest", json={"source": "device-a", **body}, headers=_bearer(user))
    assert response.status_code == 200, response.text
    return response.json()


async def _bulk(client, user, store, records, source):
    response = await client.post(
        f"/api/store/{store}/bulk",
        json={"mode": "import", "records": records, "source": source},
        headers=_bearer(user),
    )
    assert response.status_code == 200, response.text
    return response.json()


async def test_lesson_import_serves_the_lesson_and_its_segments(client, owner):
    response = await _import_lesson(client, owner)
    assert response.status_code == 200, response.text

    body = (await client.get(f"/api/lessons/{LESSON_ID}", headers=_bearer(owner))).json()
    assert body["title"] == "Renamed greeting"
    assert body["meta"] == LESSON["meta"]
    assert "title" not in body["meta"]
    assert body["segments"] == SEGMENTS
    assert body["created_at"].startswith("2026-05-01T08:30:00.123")


async def test_lesson_manifest_matches_the_hash_of_what_the_device_sent(client, owner):
    await _import_lesson(client, owner)
    digest = await _manifest(client, owner, {"stores": {"lessons": [LESSON_ID], "segments": [LESSON_ID]}})
    assert digest["stores"]["lessons"] == {"count": 1, "sha256": store_hash([(LESSON_ID, LESSON)])}
    assert digest["stores"]["segments"] == {"count": 1, "sha256": store_hash([(LESSON_ID, SEGMENTS)])}


async def test_lesson_import_returns_what_the_account_holds(client, owner):
    response = await _import_lesson(client, owner)
    assert response.json() == {"count": 1, "after": [{"lesson": LESSON, "segments": SEGMENTS}]}


async def test_a_second_lesson_import_keeps_the_account_copy(client, owner):
    await _import_lesson(client, owner)
    await client.patch(f"/api/lessons/{LESSON_ID}", json={"title": "Renamed on the server"}, headers=_bearer(owner))
    retry = await _import_lesson(client, owner)
    assert retry.json()["after"][0]["lesson"]["title"] == "Renamed on the server"
    body = (await client.get(f"/api/lessons/{LESSON_ID}", headers=_bearer(owner))).json()
    assert body["segment_count"] == 2
    assert len((await client.get("/api/lessons", headers=_bearer(owner))).json()) == 1


async def test_a_lesson_without_segments_verifies(client, owner):
    response = await _import_lesson(client, owner, segments=[])
    assert response.json()["after"][0]["segments"] == []
    digest = await _manifest(client, owner, {"stores": {"segments": [LESSON_ID]}})
    assert digest["stores"]["segments"] == {"count": 1, "sha256": store_hash([(LESSON_ID, [])])}


async def test_a_segment_without_timing_is_stored_as_sent(client, owner):
    untimed = [{"id": "s1", "text": "no timing", "start": None}]
    response = await _import_lesson(client, owner, segments=untimed)
    assert response.json()["after"][0]["segments"] == untimed


async def test_a_lesson_another_account_imported_is_a_409(client, owner, stranger):
    await _import_lesson(client, owner)
    response = await _import_lesson(client, stranger, {**LESSON, "title": "hijack"})
    assert response.status_code == 409
    assert "another account" in response.json()["detail"]
    body = (await client.get(f"/api/lessons/{LESSON_ID}", headers=_bearer(owner))).json()
    assert body["title"] == "Renamed greeting"


async def test_a_lesson_the_schema_rejects_is_422_at_its_position(client, owner):
    response = await _import_lesson(client, owner, {**LESSON, "source": "podcast"})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"][:3] == ["body", "lessons", 0]


async def _upload(client, user, payload, kind="video", segment_id=None, content_type="video/mp4"):
    data = {"lesson_id": LESSON_ID, "kind": kind}
    if segment_id is not None:
        data["segment_id"] = segment_id
    return await client.post(
        "/api/import/media",
        data=data,
        files={"file": ("blob", payload, content_type)},
        headers=_bearer(user),
    )


async def _media_rows(db_session):
    return (await db_session.scalars(select(MediaObject))).all()


async def test_media_import_stores_the_sha256_and_keeps_an_equal_copy(client, owner, app_s3, db_session):
    await _import_lesson(client, owner)
    payload = os.urandom(300_000)
    for _ in range(2):
        response = await _upload(client, owner, payload)
        assert response.status_code == 200, response.text
        assert response.json()["sha256"] == hashlib.sha256(payload).hexdigest()
    rows = await _media_rows(db_session)
    assert len(rows) == 1

    streamed = await client.get(f"/api/media/{rows[0].id}", headers=_bearer(owner))
    assert streamed.content == payload
    lesson = (await client.get(f"/api/lessons/{LESSON_ID}", headers=_bearer(owner))).json()
    assert lesson["video_url"].startswith(f"/api/media/{rows[0].id}?token=")


async def test_media_import_replaces_a_different_copy_and_deletes_the_old_object(client, owner, app_s3, db_session):
    await _import_lesson(client, owner)
    await _upload(client, owner, b"first version")
    old_key = (await _media_rows(db_session))[0].object_key
    await _upload(client, owner, b"second version")
    db_session.expire_all()
    rows = await _media_rows(db_session)
    assert [row.size for row in rows] == [len(b"second version")]
    listing = await app_s3.list_objects_v2(Bucket=settings.s3_bucket, Prefix=old_key)
    assert listing.get("KeyCount", 0) == 0


async def test_media_manifest_reports_each_blob_and_null_for_a_missing_one(client, owner, app_s3):
    await _import_lesson(client, owner)
    take = b"shadowing take"
    response = await _upload(client, owner, take, kind="shadowing", segment_id="s1", content_type="audio/webm;codecs=opus")
    assert response.status_code == 200, response.text
    digest = await _manifest(
        client,
        owner,
        {
            "stores": {},
            "media": [
                {"lessonId": LESSON_ID, "kind": "shadowing", "segmentId": "s1"},
                {"lessonId": LESSON_ID, "kind": "shadowing", "segmentId": "s2"},
            ],
        },
    )
    assert digest["media"][0]["sha256"] == hashlib.sha256(take).hexdigest()
    assert digest["media"][0]["size"] == len(take)
    assert digest["media"][1] is None


async def test_media_for_another_accounts_lesson_is_404(client, owner, stranger, app_s3):
    await _import_lesson(client, owner)
    assert (await _upload(client, stranger, b"x")).status_code == 404


async def test_shadowing_media_needs_a_segment_id(client, owner, app_s3):
    await _import_lesson(client, owner)
    assert (await _upload(client, owner, b"x", kind="shadowing", content_type="audio/webm")).status_code == 422


async def test_a_retry_from_the_same_device_never_counts_twice(client, owner):
    await _bulk(client, owner, "learner-profile", [PROFILE], "device-a")
    await _bulk(client, owner, "learner-profile", [PROFILE], "device-a")
    changed = await _bulk(client, owner, "learner-profile", [{**PROFILE, "totalSessions": 9}], "device-a")
    assert changed["after"][0]["totalSessions"] == 3


async def test_a_second_device_with_an_identical_record_is_summed(client, owner):
    await _bulk(client, owner, "learner-profile", [PROFILE], "device-a")
    second = await _bulk(client, owner, "learner-profile", [PROFILE], "device-b")
    assert second["after"][0]["totalSessions"] == 6
    assert second["after"][0]["totalStudyMinutes"] == 24


async def test_a_retry_merges_again_a_record_the_account_deleted_since(client, owner):
    stat = {"vocabId": "w1", "exerciseType": "cloze", "correct": 1, "total": 2}
    await _bulk(client, owner, "exercise-stats", [stat], "device-a")
    await client.delete("/api/store/exercise-stats/w1:cloze", headers=_bearer(owner))
    retry = await _bulk(client, owner, "exercise-stats", [stat], "device-a")
    assert retry["after"] == [stat]


async def test_manifest_takes_more_ids_than_asyncpg_can_bind(client, owner):
    ids = [f"w{n}" for n in range(40_000)]
    keys = [{"store": "vocabulary", "recordId": record_id} for record_id in ids[:20_000]]
    digest = await _manifest(client, owner, {"stores": {"vocabulary": ids, "lessons": ids}, "quarantine": keys})
    assert digest["stores"]["vocabulary"]["count"] == 0
    assert digest["quarantine"]["count"] == 0


async def test_non_union_manifest_matches_the_after_the_bulk_returned(client, owner):
    await _bulk(client, owner, "learner-profile", [PROFILE], "device-a")
    after = (await _bulk(client, owner, "learner-profile", [{**PROFILE, "totalSessions": 1}], "device-b"))["after"]
    digest = await _manifest(client, owner, {"stores": {"learner-profile": ["profile"]}})
    assert digest["stores"]["learner-profile"] == {"count": 1, "sha256": store_hash([("profile", after[0])])}


async def test_union_import_returns_the_account_copy_for_an_id_both_devices_hold(client, owner):
    first = {"id": "__global", "surface": "global", "ownerId": None, "messages": [{"id": "a"}], "updatedAt": 1}
    second = {**first, "messages": [{"id": "b"}], "updatedAt": 2}
    await _bulk(client, owner, "threads", [first], "device-a")
    after = (await _bulk(client, owner, "threads", [second], "device-b"))["after"]
    assert after == [first]
    digest = await _manifest(client, owner, {"stores": {"threads": ["__global"]}})
    assert digest["stores"]["threads"]["sha256"] == store_hash([("__global", after[0])])


async def test_the_fault_flag_breaks_only_that_stores_hash(client, owner, monkeypatch):
    records = [{"id": f"w{n}", "word": "字", "sourceLessonId": LESSON_ID, "createdAt": "2026-09-23"} for n in range(3)]
    await _bulk(client, owner, "vocabulary", records, "device-a")
    await _bulk(client, owner, "daily-tasks", [{"id": "t1", "title": "Review"}], "device-a")
    body = {"stores": {"vocabulary": ["w0", "w1", "w2"], "daily-tasks": ["t1"]}}
    expected = store_hash([(record["id"], record) for record in records])
    assert (await _manifest(client, owner, body))["stores"]["vocabulary"]["sha256"] == expected

    monkeypatch.setattr(settings, "import_fault", "vocabulary")
    faulted = await _manifest(client, owner, body)
    assert faulted["stores"]["vocabulary"] == {"count": 3, "sha256": store_hash([(r["id"], r) for r in records[1:]])}
    assert faulted["stores"]["daily-tasks"]["sha256"] == store_hash([("t1", {"id": "t1", "title": "Review"})])


async def test_manifest_hashes_only_the_ids_this_device_sent(client, owner):
    records = [{"id": f"w{n}", "word": "字", "sourceLessonId": LESSON_ID, "createdAt": "2026-09-23"} for n in range(3)]
    await _bulk(client, owner, "vocabulary", records, "device-a")
    digest = await _manifest(client, owner, {"stores": {"vocabulary": ["w2", "missing"]}})
    assert digest["stores"]["vocabulary"] == {"count": 1, "sha256": store_hash([("w2", records[2])])}


async def test_manifest_rejects_an_unknown_store(client, owner):
    response = await client.post(
        "/api/import/manifest", json={"source": "device-a", "stores": {"crypto": []}}, headers=_bearer(owner)
    )
    assert response.status_code == 422


async def test_quarantine_keeps_the_raw_record_per_device_and_digests_it(client, owner, stranger):
    raw = {"itemId": "w1", "itemType": "sentence", "dueDate": "2026-09-23"}
    body = {
        "source": "device-a",
        "records": [{"store": "spaced-repetition", "recordId": "w1", "raw": raw, "error": "itemType: bad literal"}],
    }
    for _ in range(2):
        response = await client.post("/api/import/quarantine", json=body, headers=_bearer(owner))
        assert response.status_code == 200, response.text
    keys = [{"store": "spaced-repetition", "recordId": "w1"}]
    digest = await _manifest(client, owner, {"stores": {}, "quarantine": keys})
    assert digest["quarantine"] == {"count": 1, "sha256": store_hash([("spaced-repetition:w1", raw)])}
    assert (await _manifest(client, stranger, {"stores": {}, "quarantine": keys}))["quarantine"]["count"] == 0


async def test_quarantine_rejects_an_unknown_store(client, owner):
    body = {"source": "device-a", "records": [{"store": "crypto", "recordId": "keys", "raw": {}, "error": "x"}]}
    assert (await client.post("/api/import/quarantine", json=body, headers=_bearer(owner))).status_code == 422


async def test_every_import_route_needs_a_session(client):
    for path in ("/api/import/lessons", "/api/import/media", "/api/import/manifest", "/api/import/quarantine"):
        assert (await client.post(path, json={})).status_code == 401



async def test_exported_lessons_digest_on_the_server_as_the_browser_sent_them(client, owner):
    exported = json.loads((Path(__file__).parent / "fixtures" / "legacy-export.json").read_text())["lessons"]
    body = {"lessons": [{**item["lesson"], "segments": item["segments"]} for item in exported]}
    assert (await client.post("/api/import/lessons", json=body, headers=_bearer(owner))).status_code == 200
    ids = [item["id"] for item in exported]
    digest = await _manifest(client, owner, {"stores": {"lessons": ids, "segments": ids}})
    assert digest["stores"]["lessons"]["sha256"] == store_hash([(item["id"], item["lesson"]) for item in exported])
    assert digest["stores"]["segments"]["sha256"] == store_hash([(item["id"], item["segments"]) for item in exported])


EXPORT = json.loads((Path(__file__).parent / "fixtures" / "legacy-export.json").read_text())


@pytest.mark.parametrize("store", sorted(EXPORT["stores"]))
async def test_a_retry_never_overwrites_a_newer_server_edit(client, owner, store):
    record = EXPORT["stores"][store][0]
    first = await _bulk(client, owner, store, [record["data"]], "device-a")
    path = f"/api/store/{store}/{quote(record['id'], safe='')}"
    edited = {**first["after"][0], "editedOnServer": True}
    assert (await client.put(path, json=edited, headers=_bearer(owner))).status_code == 200

    retry = await _bulk(client, owner, store, [record["data"]], "device-a")
    assert retry["after"] == [edited]
    assert (await client.get(path, headers=_bearer(owner))).json() == edited
