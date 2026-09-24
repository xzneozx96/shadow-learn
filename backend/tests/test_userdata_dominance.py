import random
import typing
from typing import Any

import pytest

from app.userdata import merge, schemas
from app.userdata.specs import STORES

SKILLS = sorted(merge.SKILLS)


def _date(rng: random.Random) -> str:
    return f"2026-0{rng.randint(1, 9)}-{rng.randint(10, 28)}"


def _fold(rng: random.Random, fold: merge.Fold) -> dict[str, Any]:
    return {
        **{key: rng.randint(1, 50) for key in (*fold.sums, *fold.maxes)},
        **{key: _date(rng) for key in (*fold.latest, *fold.earliest)},
    }


def _progress(rng: random.Random) -> dict[str, Any]:
    return {
        **_fold(rng, merge.PROGRESS),
        "accuracyTrend": [{"date": _date(rng), "exercises": rng.randint(1, 9), "accuracy": rng.random()}],
        "skillProgress": {skill: {**_fold(rng, merge.SKILL_STATS), "accuracy": rng.random()} for skill in SKILLS},
    }


RECORDS = {
    merge.learner_profile: lambda rng: _fold(rng, merge.PROFILE),
    merge.progress: _progress,
    merge.mastery: lambda rng: {skill: _fold(rng, merge.SKILL_MASTERY) for skill in SKILLS},
    merge.exercise_stat: lambda rng: _fold(rng, merge.EXERCISE_STAT),
    merge.mistake: lambda rng: {**_fold(rng, merge.MISTAKE), "examples": [{"date": _date(rng)}]},
    merge.higher_score: lambda rng: {"score": rng.randint(1, 100)},
    merge.later_seen: lambda rng: {"lastSeenAt": _date(rng)},
    merge.later_updated: lambda rng: {"updatedAt": _date(rng)},
    merge.card_states: lambda rng: {"states": {front: {"updatedAt": _date(rng)} for front in ("a", "b")}},
}

# Numbers the rules derive rather than carry, so a merge may change them freely.
DERIVED = {"accuracy", "accuracyRate"}


def _numeric_leaves(value: Any, path: tuple = ()) -> list[tuple]:
    if isinstance(value, dict):
        return [leaf for key, item in value.items() if key not in DERIVED for leaf in _numeric_leaves(item, (*path, key))]
    if isinstance(value, list):
        return [leaf for i, item in enumerate(value) for leaf in _numeric_leaves(item, (*path, i))]
    return [path] if isinstance(value, int | float) and not isinstance(value, bool) and value > 0 else []


def _zeroed(value: Any, path: tuple) -> Any:
    if not path:
        return 0
    head, *rest = path
    copy = dict(value) if isinstance(value, dict) else list(value)
    copy[head] = _zeroed(value[head], tuple(rest))
    return copy


def _from_local(merged: Any, local: Any, path: tuple) -> bool:
    """Whether the local record contributes to this leaf; trend days are matched by date, not position."""
    if not path:
        return isinstance(local, int | float) and local > 0
    head, *rest = path
    if isinstance(merged, list):
        by_date = {day["date"]: day for day in local} if isinstance(local, list) else {}
        day = merged[head]
        return day["date"] in by_date and _from_local(day, by_date[day["date"]], tuple(rest))
    return isinstance(local, dict) and head in local and _from_local(merged[head], local[head], tuple(rest))


def test_every_rule_in_use_has_a_dominance():
    assert {spec.merge for spec in STORES.values()} <= merge.DOMINANCE.keys()


@pytest.mark.parametrize("rule", list(RECORDS), ids=[rule.__name__ for rule in RECORDS])
def test_a_merge_dominates_both_sides(rule):
    rng = random.Random(rule.__name__)
    dominates = merge.DOMINANCE[rule]
    for _ in range(300):
        a, b = RECORDS[rule](rng), RECORDS[rule](rng)
        merged = rule(a, b)
        assert dominates(merged, a), (a, b, merged)
        assert dominates(merged, b), (a, b, merged)


@pytest.mark.parametrize("rule", [rule for rule in RECORDS if rule in merge.DELTAS], ids=lambda rule: rule.__name__)
def test_dominance_checks_every_counter_the_rule_carries(rule):
    rng = random.Random(f"leaves:{rule.__name__}")
    dominates = merge.DOMINANCE[rule]
    for _ in range(50):
        local = RECORDS[rule](rng)
        merged = rule(RECORDS[rule](rng), local)
        for leaf in _numeric_leaves(merged):
            if _from_local(merged, local, leaf):
                assert not dominates(_zeroed(merged, leaf), local), f"dominance ignores {leaf}"


@pytest.mark.parametrize("rule", list(merge.DELTAS), ids=lambda rule: rule.__name__)
def test_a_delta_merge_ends_where_a_single_merge_of_the_final_record_would(rule):
    rng = random.Random(f"delta:{rule.__name__}")
    for _ in range(100):
        other, first, final = RECORDS[rule](rng), RECORDS[rule](rng), RECORDS[rule](rng)
        stepped = rule(rule(other, first), merge.DELTAS[rule](final, first))
        direct = rule(other, final)
        for leaf in _numeric_leaves(direct):
            if leaf[-1] in {"exercises"} or "accuracyTrend" in leaf:
                continue
            got, want = stepped, direct
            for key in leaf:
                got, want = got[key], want[key]
            if leaf[-1] in merge.PROFILE.maxes + merge.SKILL_MASTERY.maxes:
                assert got >= want
            else:
                assert got == pytest.approx(want), leaf


FOLDS = {
    "learner-profile": [(schemas.LearnerProfile, merge.PROFILE)],
    "progress-db": [(schemas.ProgressStats, merge.PROGRESS), (schemas.SkillStats, merge.SKILL_STATS)],
    "mastery-db": [(schemas.SkillMastery, merge.SKILL_MASTERY)],
    "exercise-stats": [(schemas.ExerciseStat, merge.EXERCISE_STAT)],
    "mistakes-db": [(schemas.ErrorPattern, merge.MISTAKE)],
}
# Numbers a counting rule leaves to the account copy on purpose.
SERVER_OWNED = {"dailyGoalMinutes"}


def _numeric_fields(model: type[schemas.BaseModel]) -> set[str]:
    numeric = {int, float}
    return {
        field.alias or name
        for name, field in model.model_fields.items()
        if set(typing.get_args(field.annotation)) - {type(None)} <= numeric | {int | float}
        and (set(typing.get_args(field.annotation)) & numeric or field.annotation in numeric)
    }


@pytest.mark.parametrize("store", list(FOLDS))
def test_every_counter_in_the_schema_has_a_rule(store):
    assert STORES[store].merge in merge.DELTAS
    for model, fold in FOLDS[store]:
        ruled = {*fold.sums, *fold.maxes}
        assert _numeric_fields(model) - DERIVED - SERVER_OWNED == ruled, model.__name__
