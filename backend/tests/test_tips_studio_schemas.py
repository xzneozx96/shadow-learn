from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.tips.schemas import (
    ConceptCard,
    StudioCards,
    StudioLocale,  # noqa: F401  -- imported to verify public export per spec
    StudioRequest,
    StudioStudyGuide,
    StudioSummary,
)


def test_studio_request_valid():
    req = StudioRequest(video_id="abc123", transcript="hello world", locale="en")
    assert req.video_id == "abc123"
    assert req.locale == "en"


def test_studio_request_rejects_invalid_locale():
    with pytest.raises(ValidationError):
        StudioRequest(video_id="abc123", transcript="x", locale="fr")  # type: ignore[arg-type]


def test_studio_request_rejects_empty_transcript():
    with pytest.raises(ValidationError):
        StudioRequest(video_id="abc123", transcript="", locale="en")


def test_studio_summary_shape():
    s = StudioSummary(abstract="It's about tones", takeaways=["1", "2", "3"])
    assert len(s.takeaways) == 3


def test_studio_summary_rejects_too_few_takeaways():
    with pytest.raises(ValidationError):
        StudioSummary(abstract="x", takeaways=["1", "2"])  # min 3


def test_studio_study_guide_shape():
    g = StudioStudyGuide(
        items=[
            {"question": "Q1", "answer": "A1"},
            {"question": "Q2", "answer": "A2"},
            {"question": "Q3", "answer": "A3"},
        ]
    )
    assert g.items[0].question == "Q1"


def test_studio_cards_shape():
    cards = StudioCards(
        cards=[
            ConceptCard(
                id="c1", front="When do you use 了?", rule="Completed action",
                example="我吃了饭", trap="Not the same as 过",
            ),
        ]
    )
    assert cards.cards[0].id == "c1"


def test_studio_cards_hard_cap_of_8():
    with pytest.raises(ValidationError):
        StudioCards(
            cards=[
                ConceptCard(id=f"c{i}", front="q", rule="r", example="e", trap=None)
                for i in range(9)
            ]
        )
