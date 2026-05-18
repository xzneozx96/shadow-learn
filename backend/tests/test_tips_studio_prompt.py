from app.tips.services.studio import build_prompt


def test_mind_map_prompt_en_mentions_tree_and_limits():
    p = build_prompt(kind="mind_map", transcript="abc", locale="en")
    assert "mind map" in p.lower() or "tree" in p.lower()
    assert "depth" in p.lower()
    assert "60" in p  # node cap
    assert "<transcript>\nabc\n</transcript>" in p
    assert "English" in p


def test_mind_map_prompt_vi_localizes_labels():
    p = build_prompt(kind="mind_map", transcript="abc", locale="vi")
    assert "Vietnamese" in p


def test_mind_map_prompt_schema_shape_documented():
    p = build_prompt(kind="mind_map", transcript="abc", locale="en")
    # Prompt must teach the model the JSON shape.
    assert "root" in p
    assert "label" in p
    assert "children" in p
    assert "summary" in p
