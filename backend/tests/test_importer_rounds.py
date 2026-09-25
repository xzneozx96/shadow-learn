import hashlib
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.importer.canonical import canonical
from app.importer.models import QuarantinedRecord
from tests.conftest import register_and_login

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.real_auth]

LESSON_ID = str(uuid.UUID(int=7))
LESSON = {
    "id": LESSON_ID,
    "title": "Greetings",
    "source": "youtube",
    "sourceUrl": None,
    "duration": 5.0,
    "sourceLanguage": "zh-CN",
    "translationLanguages": ["en"],
    "createdAt": "2026-05-01T08:30:00.123Z",
    "lastOpenedAt": None,
    "meta": {"progressSegmentId": "0", "tags": []},
}
SEGMENTS = [{"id": "0", "start": 0, "end": 5, "text": "你好"}]
PROFILE = {"name": "Ada", "totalSessions": 3, "totalStudyMinutes": 10}
BEST = {"lessonId": LESSON_ID, "segmentId": "0", "score": 80}
STORY = {"word": "你好", "lang": "vi", "story": "first", "updatedAt": "2026-06-01T00:00:00.000Z"}
THREAD = {"id": "__global", "surface": "global", "ownerId": None, "messages": [{"id": "a"}], "updatedAt": 1}


@pytest_asyncio.fixture(loop_scope="session")
async def owner(client, db_session):
    return await register_and_login(client, f"rounds-{uuid.uuid4().hex[:8]}@example.com")


def _bearer(user) -> dict:
    return {"Authorization": f"Bearer {user['access_token']}"}


async def _bulk(client, user, store, records, source):
    response = await client.post(
        f"/api/store/{store}/bulk",
        json={"mode": "import", "records": records, "source": source},
        headers=_bearer(user),
    )
    assert response.status_code == 200, response.text
    return response.json()


async def _lessons(client, user, lesson, source="device-a"):
    response = await client.post(
        "/api/import/lessons", json={"lessons": [{**lesson, "segments": SEGMENTS}], "source": source}, headers=_bearer(user)
    )
    assert response.status_code == 200, response.text
    return response.json()


async def _get(client, user, store, record_id):
    return (await client.get(f"/api/store/{store}/{record_id}", headers=_bearer(user))).json()


async def test_round_two_counts_the_growth_once_alongside_other_devices(client, owner):
    await _bulk(client, owner, "learner-profile", [PROFILE], "device-a")
    await _bulk(client, owner, "learner-profile", [{**PROFILE, "totalSessions": 4}], "device-b")
    grown = {**PROFILE, "totalSessions": 5}
    for _ in range(2):
        await _bulk(client, owner, "learner-profile", [grown], "device-a")
    assert (await _get(client, owner, "learner-profile", "profile"))["totalSessions"] == 5 + 4


async def test_round_two_raises_a_higher_score(client, owner):
    await _bulk(client, owner, "shadowing-bests", [BEST], "device-a")
    round_two = await _bulk(client, owner, "shadowing-bests", [{**BEST, "score": 90}], "device-a")
    assert round_two["after"][0]["score"] == 90


async def test_round_two_takes_a_newer_story(client, owner):
    await _bulk(client, owner, "word-stories", [STORY], "device-a")
    newer = {**STORY, "story": "second", "updatedAt": "2026-06-02T00:00:00.000Z"}
    assert (await _bulk(client, owner, "word-stories", [newer], "device-a"))["after"] == [newer]


async def test_round_two_replaces_a_union_record_this_device_wrote(client, owner):
    await _bulk(client, owner, "threads", [THREAD], "device-a")
    longer = {**THREAD, "messages": [{"id": "a"}, {"id": "b"}], "updatedAt": 2}
    round_two = await _bulk(client, owner, "threads", [longer], "device-a")
    assert round_two == {"count": 1, "after": [longer], "outcomes": {"__global": "stored"}}


async def test_a_union_record_both_sides_changed_is_a_conflict_and_the_account_copy_stays(client, owner):
    await _bulk(client, owner, "threads", [THREAD], "device-a")
    edited = {**THREAD, "messages": [{"id": "edited"}]}
    await client.put("/api/store/threads/__global", json=edited, headers=_bearer(owner))
    round_two = await _bulk(client, owner, "threads", [{**THREAD, "messages": [{"id": "a"}, {"id": "b"}]}], "device-a")
    assert round_two["outcomes"] == {"__global": "conflict"}
    assert await _get(client, owner, "threads", "__global") == edited


async def test_round_two_replaces_a_lesson_this_device_imported(client, owner):
    await _lessons(client, owner, LESSON)
    renamed = {**LESSON, "title": "Greetings, renamed later"}
    assert (await _lessons(client, owner, renamed))["outcomes"] == {LESSON_ID: "stored"}
    body = (await client.get(f"/api/lessons/{LESSON_ID}", headers=_bearer(owner))).json()
    assert body["title"] == "Greetings, renamed later"


async def test_a_lesson_both_sides_changed_is_a_conflict(client, owner):
    await _lessons(client, owner, LESSON)
    await client.patch(f"/api/lessons/{LESSON_ID}", json={"title": "Renamed on the server"}, headers=_bearer(owner))
    assert (await _lessons(client, owner, LESSON))["outcomes"] == {LESSON_ID: "kept_server"}
    changed = {**LESSON, "title": "Renamed on the device"}
    assert (await _lessons(client, owner, changed))["outcomes"] == {LESSON_ID: "conflict"}
    body = (await client.get(f"/api/lessons/{LESSON_ID}", headers=_bearer(owner))).json()
    assert body["title"] == "Renamed on the server"


async def test_the_manifest_reports_records_the_account_does_not_dominate(client, owner):
    await _bulk(client, owner, "learner-profile", [PROFILE], "device-a")
    await _bulk(client, owner, "shadowing-bests", [BEST], "device-a")
    response = await client.post(
        "/api/import/manifest",
        json={
            "source": "device-a",
            "stores": {},
            "dominance": {"learner-profile": [{**PROFILE, "totalSessions": 4}], "shadowing-bests": [BEST]},
        },
        headers=_bearer(owner),
    )
    assert response.json()["undominated"] == {"learner-profile": ["profile"], "shadowing-bests": []}


def _sha256(value) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


async def _quarantine_conflict(client, user, store, record_id, raw, source="device-a"):
    body = {"source": source, "records": [{"store": store, "recordId": record_id, "raw": raw, "error": [{"type": "conflict", "accountSha256": "forged"}]}]}
    response = await client.post("/api/import/quarantine", json=body, headers=_bearer(user))
    assert response.status_code == 200, response.text


async def test_a_union_conflict_is_kept_for_repair_with_the_account_row_hash_once(client, owner, db_session):
    await _bulk(client, owner, "threads", [THREAD], "device-a")
    edited = {**THREAD, "messages": [{"id": "edited"}]}
    await client.put("/api/store/threads/__global", json=edited, headers=_bearer(owner))
    device = {**THREAD, "messages": [{"id": "a"}, {"id": "b"}]}
    for _ in range(2):
        assert (await _bulk(client, owner, "threads", [device], "device-a"))["outcomes"] == {"__global": "conflict"}
        await _quarantine_conflict(client, owner, "threads", "__global", device)
    account = await _get(client, owner, "threads", "__global")
    assert account == edited
    rows = (await db_session.execute(select(QuarantinedRecord.raw, QuarantinedRecord.error))).all()
    assert rows == [(device, [{"type": "conflict", "accountSha256": _sha256(account)}])]


async def test_a_lesson_conflict_is_kept_for_repair_with_the_account_lesson_hash_once(client, owner, db_session):
    await _lessons(client, owner, LESSON)
    await client.patch(f"/api/lessons/{LESSON_ID}", json={"title": "Renamed on the server"}, headers=_bearer(owner))
    changed = {**LESSON, "title": "Renamed on the device"}
    raw = {**changed, "segments": SEGMENTS}
    for _ in range(2):
        after = await _lessons(client, owner, changed)
        assert after["outcomes"] == {LESSON_ID: "conflict"}
        await _quarantine_conflict(client, owner, "lessons", LESSON_ID, raw)
    account = after["after"][0]
    rows = (await db_session.execute(select(QuarantinedRecord.raw, QuarantinedRecord.error))).all()
    assert rows == [(raw, [{"type": "conflict", "accountSha256": _sha256([account["lesson"], account["segments"]])}])]
