"""Pydantic schemas for /api/tips/studio/{kind} request and response payloads."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

StudioLocale = Literal["en", "vi"]
StudioKind = Literal["summary", "study_guide", "cards", "mind_map"]


class StudioRequest(BaseModel):
    video_id: str = Field(min_length=6, max_length=32)
    transcript: str = Field(min_length=1)
    locale: StudioLocale


class StudioSummary(BaseModel):
    abstract: str = Field(min_length=1, max_length=600)
    takeaways: list[str] = Field(min_length=3, max_length=6)


class StudyGuideItem(BaseModel):
    question: str = Field(min_length=1)
    answer: str = Field(min_length=1)


class StudioStudyGuide(BaseModel):
    items: list[StudyGuideItem] = Field(min_length=3, max_length=10)


class ConceptCard(BaseModel):
    id: str = Field(min_length=1)
    front: str = Field(min_length=1, max_length=200)
    rule: str = Field(min_length=1, max_length=400)
    example: str = Field(min_length=1, max_length=200)
    trap: str | None = Field(default=None, max_length=200)


class StudioCards(BaseModel):
    cards: list[ConceptCard] = Field(min_length=1, max_length=8)


class MindMapNode(BaseModel):
    """One node in the Mind Map tree. `children` is recursive."""
    label: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=1, max_length=400)
    # Optional timestamp in seconds. LLM picks the nearest [HH:MM:SS] marker
    # from the transcript prompt. None = no anchor (root nodes / abstract concepts).
    start_sec: float | None = Field(default=None, ge=0)
    children: list["MindMapNode"] = Field(default_factory=list)

    @field_validator("start_sec", mode="before")
    @classmethod
    def _coerce_start_sec(cls, v: object) -> object:
        """Accept int/float, null, or 'MM:SS'/'HH:MM:SS' strings the LLM sometimes
        emits despite the prompt asking for integer seconds."""
        if v is None or isinstance(v, (int, float)):
            return v
        if isinstance(v, str):
            s = v.strip()
            if not s or s.lower() in {"null", "none"}:
                return None
            if ":" in s:
                parts = s.split(":")
                try:
                    nums = [int(p) for p in parts]
                except ValueError:
                    return v  # let downstream validation reject
                if len(nums) == 2:
                    return nums[0] * 60 + nums[1]
                if len(nums) == 3:
                    return nums[0] * 3600 + nums[1] * 60 + nums[2]
                return v
            # bare numeric string
            try:
                return float(s)
            except ValueError:
                return v
        return v


class StudioMindMap(BaseModel):
    """Single rooted tree. Hard limits: depth <= 4, total nodes <= 60."""
    root: MindMapNode

    @model_validator(mode="after")
    def _enforce_tree_limits(self) -> "StudioMindMap":
        max_depth = 4
        max_nodes = 60

        def walk(node: MindMapNode, depth: int) -> tuple[int, int]:
            count = 1
            deepest = depth
            for child in node.children:
                d, c = walk(child, depth + 1)
                deepest = max(deepest, d)
                count += c
            return deepest, count

        deepest, total = walk(self.root, 0)
        if deepest > max_depth:
            raise ValueError(f"mind map depth {deepest} exceeds max {max_depth}")
        if total > max_nodes:
            raise ValueError(f"mind map has {total} nodes, exceeds max {max_nodes}")
        return self


MindMapNode.model_rebuild()
