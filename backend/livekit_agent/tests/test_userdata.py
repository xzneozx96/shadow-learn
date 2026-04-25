import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from userdata import SpeakSessionData


def test_speak_session_data_has_new_fields():
    data = SpeakSessionData()
    assert hasattr(data, "target_language")
    assert hasattr(data, "proficiency_level")
    assert hasattr(data, "situation_config")
    assert data.target_language is None
    assert data.proficiency_level is None
    assert data.situation_config is None


def test_speak_session_data_holds_situation_config():
    from dataclasses import dataclass

    @dataclass
    class FakeConfig:
        id: str
        opening_line: str

    data = SpeakSessionData()
    data.situation_config = FakeConfig(id="test", opening_line="hi")
    assert data.situation_config.opening_line == "hi"
