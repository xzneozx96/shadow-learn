from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.tips.schemas import StudioMindMap


def _leaf(label: str) -> dict:
    return {"label": label, "summary": "x", "children": []}


def _tree(depth: int, fanout: int = 2) -> dict:
    if depth == 0:
        return _leaf(f"leaf-{depth}")
    return {
        "label": f"n-{depth}",
        "summary": "x",
        "children": [_tree(depth - 1, fanout) for _ in range(fanout)],
    }


def test_accepts_valid_tree_depth_4_60_nodes():
    # Depth 4, fanout 2, total = 1+2+4+8+16 = 31 nodes
    payload = {"root": _tree(4)}
    StudioMindMap.model_validate(payload)


def test_rejects_depth_5():
    payload = {"root": _tree(5)}
    with pytest.raises(ValidationError) as excinfo:
        StudioMindMap.model_validate(payload)
    msgs = [e["msg"] for e in excinfo.value.errors()]
    assert any("depth" in m.lower() for m in msgs), msgs


def test_rejects_more_than_60_nodes():
    root = {
        "label": "root",
        "summary": "x",
        "children": [_leaf(f"c{i}") for i in range(61)],
    }
    payload = {"root": root}
    with pytest.raises(ValidationError) as excinfo:
        StudioMindMap.model_validate(payload)
    msgs = [e["msg"] for e in excinfo.value.errors()]
    assert any("node" in m.lower() for m in msgs), msgs


def test_accepts_60_node_boundary():
    root = {
        "label": "root",
        "summary": "x",
        "children": [_leaf(f"c{i}") for i in range(59)],  # 1 root + 59 leaves = 60
    }
    StudioMindMap.model_validate({"root": root})


def test_root_label_required():
    with pytest.raises(ValidationError):
        StudioMindMap.model_validate({"root": {"label": "", "summary": "x", "children": []}})


def test_start_sec_coerces_mm_ss_string():
    payload = {"root": {"label": "r", "summary": "s", "start_sec": "01:23", "children": []}}
    tree = StudioMindMap.model_validate(payload)
    assert tree.root.start_sec == 83


def test_start_sec_coerces_hh_mm_ss_string():
    payload = {"root": {"label": "r", "summary": "s", "start_sec": "01:02:03", "children": []}}
    tree = StudioMindMap.model_validate(payload)
    assert tree.root.start_sec == 3723


def test_start_sec_coerces_bare_numeric_string():
    payload = {"root": {"label": "r", "summary": "s", "start_sec": "42", "children": []}}
    tree = StudioMindMap.model_validate(payload)
    assert tree.root.start_sec == 42


def test_start_sec_null_passthrough():
    payload = {"root": {"label": "r", "summary": "s", "start_sec": None, "children": []}}
    tree = StudioMindMap.model_validate(payload)
    assert tree.root.start_sec is None


def test_start_sec_string_null_passthrough():
    payload = {"root": {"label": "r", "summary": "s", "start_sec": "null", "children": []}}
    tree = StudioMindMap.model_validate(payload)
    assert tree.root.start_sec is None
