"""Import-mode merge rules.

A rule takes the stored record and an incoming record with the same id and
returns the record to store. Records are the camelCase JSON the client writes.
"""

from collections.abc import Callable
from typing import Any

Data = dict[str, Any]
MergeRule = Callable[[Data, Data], Data]

MAX_MISTAKE_EXAMPLES = 20


def union(server: Data, incoming: Data) -> Data:
    return server


def keep_server(server: Data, incoming: Data) -> Data:
    return server


def _sum(server: Data, incoming: Data, key: str) -> int | float:
    return (server.get(key) or 0) + (incoming.get(key) or 0)


def _latest(a: str | None, b: str | None) -> str | None:
    return max(a, b) if a and b else a or b


def _earliest(a: str | None, b: str | None) -> str | None:
    return min(a, b) if a and b else a or b


def learner_profile(server: Data, incoming: Data) -> Data:
    return {
        **server,
        "currentStreakDays": max(server.get("currentStreakDays") or 0, incoming.get("currentStreakDays") or 0),
        "totalSessions": _sum(server, incoming, "totalSessions"),
        "totalStudyMinutes": _sum(server, incoming, "totalStudyMinutes"),
        "lastStudyDate": _latest(server.get("lastStudyDate"), incoming.get("lastStudyDate")),
        "profileCreated": _earliest(server.get("profileCreated"), incoming.get("profileCreated")),
    }


def _skill_stats(server: Data, incoming: Data) -> Data:
    sessions = server["sessions"] + incoming["sessions"]
    weighted = server["accuracy"] * server["sessions"] + incoming["accuracy"] * incoming["sessions"]
    return {
        **server,
        "sessions": sessions,
        "accuracy": weighted / sessions if sessions else server["accuracy"],
        "lastPracticed": _latest(server["lastPracticed"], incoming["lastPracticed"]),
    }


def _per_skill(server: Data, incoming: Data, merge_skill: MergeRule) -> Data:
    merged = {**incoming, **server}
    for skill in server.keys() & incoming.keys():
        merged[skill] = merge_skill(server[skill], incoming[skill])
    return merged


def progress(server: Data, incoming: Data) -> Data:
    counters = ("totalSessions", "totalExercises", "totalCorrect", "totalIncorrect", "totalStudyMinutes")
    merged = {**server, **{key: _sum(server, incoming, key) for key in counters}}
    merged["accuracyRate"] = merged["totalCorrect"] / merged["totalExercises"] if merged["totalExercises"] else 0

    trend = {day["date"]: day for day in server.get("accuracyTrend") or []}
    for day in incoming.get("accuracyTrend") or []:
        if day["exercises"] > trend.get(day["date"], {"exercises": -1})["exercises"]:
            trend[day["date"]] = day
    merged["accuracyTrend"] = [trend[date] for date in sorted(trend)]

    merged["skillProgress"] = _per_skill(
        server.get("skillProgress") or {}, incoming.get("skillProgress") or {}, _skill_stats
    )
    return merged


def _skill_mastery(server: Data, incoming: Data) -> Data:
    return {
        **server,
        "masteryLevel": max(server["masteryLevel"], incoming["masteryLevel"]),
        "confidenceScore": max(server["confidenceScore"], incoming["confidenceScore"]),
        "totalPracticeTime": server["totalPracticeTime"] + incoming["totalPracticeTime"],
        "lastPracticed": _latest(server["lastPracticed"], incoming["lastPracticed"]),
    }


def mastery(server: Data, incoming: Data) -> Data:
    return _per_skill(server, incoming, _skill_mastery)


def exercise_stat(server: Data, incoming: Data) -> Data:
    return {
        **server,
        "correct": _sum(server, incoming, "correct"),
        "total": _sum(server, incoming, "total"),
        "lastAttempt": _latest(server.get("lastAttempt"), incoming.get("lastAttempt")),
    }


def mistake(server: Data, incoming: Data) -> Data:
    examples = [*(server.get("examples") or []), *(incoming.get("examples") or [])]
    return {
        **server,
        "frequency": _sum(server, incoming, "frequency"),
        "lastOccurred": _latest(server.get("lastOccurred"), incoming.get("lastOccurred")),
        "examples": examples[-MAX_MISTAKE_EXAMPLES:],
    }


def higher_score(server: Data, incoming: Data) -> Data:
    return incoming if (incoming.get("score") or 0) > (server.get("score") or 0) else server


def later_seen(server: Data, incoming: Data) -> Data:
    return incoming if (incoming.get("lastSeenAt") or "") > (server.get("lastSeenAt") or "") else server
