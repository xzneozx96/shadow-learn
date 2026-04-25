"""Tests for ObserverAgent session-evaluation and room-reference fixes."""
import sys
import os
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agents.observer_agent import ObserverAgent, start_observer


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_session():
    """Minimal mock AgentSession."""
    session = MagicMock()
    session.userdata = MagicMock()
    session.userdata.situation_config = None
    # on() registers event handlers; we don't need them to fire in unit tests
    session.on = MagicMock()
    return session


def _make_room(remote_identities=("frontend-user",)):
    """Minimal mock rtc.Room with remote participants and local_participant."""
    room = MagicMock()
    participants = {}
    for identity in remote_identities:
        p = MagicMock()
        p.identity = identity
        participants[identity] = p
    room.remote_participants = participants
    room.local_participant = MagicMock()
    room.local_participant.perform_rpc = AsyncMock(return_value='{"success": true}')
    return room


def _make_llm():
    llm = MagicMock()
    llm.model = "test-model"
    return llm


# ---------------------------------------------------------------------------
# Constructor
# ---------------------------------------------------------------------------

def test_observer_agent_defaults_room_to_none():
    """ObserverAgent created without room kwarg should set self._room = None."""
    agent = ObserverAgent(session=_make_session(), llm=_make_llm())
    assert agent._room is None


def test_observer_agent_stores_room_kwarg():
    """ObserverAgent created with room kwarg should store it in self._room."""
    room = _make_room()
    agent = ObserverAgent(session=_make_session(), llm=_make_llm(), room=room)
    assert agent._room is room


# ---------------------------------------------------------------------------
# start_observer factory
# ---------------------------------------------------------------------------

def test_start_observer_passes_room_to_agent():
    """start_observer() should forward the room argument to ObserverAgent."""
    room = _make_room()
    session = _make_session()

    async def _run():
        obs = await start_observer(session=session, llm=_make_llm(), room=room)
        return obs

    obs = asyncio.get_event_loop().run_until_complete(_run())
    assert obs._room is room


# ---------------------------------------------------------------------------
# _stream_feedback — room resolution
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_stream_feedback_uses_direct_room_when_provided():
    """When self._room is set, _stream_feedback must NOT touch session.room_io."""
    room = _make_room()
    session = _make_session()
    # Make session.room_io raise to prove we never fall through to it
    del session.room_io  # AttributeError if accessed

    agent = ObserverAgent(session=session, llm=_make_llm(), room=room)
    await agent._stream_feedback({"type": "grammar", "transcript": "test", "issues": []})

    room.local_participant.perform_rpc.assert_called_once()
    call_kwargs = room.local_participant.perform_rpc.call_args.kwargs
    assert call_kwargs["method"] == "grammar_feedback"


@pytest.mark.asyncio
async def test_stream_feedback_warns_and_returns_when_no_room_available():
    """When self._room is None and session.room_io raises, log warning and return."""
    session = _make_session()
    room_io_mock = MagicMock()
    type(room_io_mock).room = PropertyMock(
        side_effect=RuntimeError("the AgentSession was not started with a room")
    )
    session.room_io = room_io_mock

    agent = ObserverAgent(session=session, llm=_make_llm(), room=None)
    # Should not raise — guard catches RuntimeError and logs warning
    await agent._stream_feedback({"type": "grammar", "transcript": "x", "issues": []})


# ---------------------------------------------------------------------------
# _fallback_evaluation — contract
# ---------------------------------------------------------------------------

def test_fallback_evaluation_includes_type_field():
    """_fallback_evaluation must return type='session-evaluation' for frontend contract."""
    agent = ObserverAgent(session=_make_session(), llm=_make_llm())
    result = agent._fallback_evaluation()
    assert result.get("type") == "session-evaluation"


# ---------------------------------------------------------------------------
# evaluate_session — resilience
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_evaluate_session_returns_fallback_when_prompt_missing():
    """evaluate_session must return a valid dict (with type field) when the prompt YAML is absent."""
    with patch("agents.observer_agent.load_prompt", return_value=None):
        agent = ObserverAgent(session=_make_session(), llm=_make_llm())
        result = await agent.evaluate_session()
        assert result.get("type") == "session-evaluation"
        assert "strengths" in result


@pytest.mark.asyncio
async def test_evaluate_session_never_raises_on_llm_failure():
    """evaluate_session must catch LLM errors and return the fallback dict, never raise."""
    llm = _make_llm()
    # Make llm.chat() raise immediately (before entering the async context manager)
    llm.chat = MagicMock(side_effect=RuntimeError("network error"))

    with patch("agents.observer_agent.load_prompt", return_value="prompt {transcript} {target_vocab} {used_vocab} {interface_language}"):
        agent = ObserverAgent(session=_make_session(), llm=llm)
        result = await agent.evaluate_session()

    # Must not raise; must return valid fallback with type field
    assert result.get("type") == "session-evaluation"
    assert "strengths" in result


@pytest.mark.asyncio
async def test_stream_feedback_falls_back_to_session_room_io():
    """When self._room is None, use session.room_io.room as fallback."""
    fallback_room = _make_room()
    session = _make_session()
    session.room_io = MagicMock()
    session.room_io.room = fallback_room

    agent = ObserverAgent(session=session, llm=_make_llm(), room=None)
    await agent._stream_feedback({"type": "grammar", "transcript": "hi", "issues": []})

    fallback_room.local_participant.perform_rpc.assert_called_once()
