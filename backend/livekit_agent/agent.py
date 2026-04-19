"""
ShadowLearn Voice Agent for Speak with AI feature.

This agent handles real-time voice conversations with students practicing Chinese.
Uses Google Gemini Live API with persona-driven character corrections.
"""

import asyncio
import logging
from pathlib import Path
from urllib.parse import unquote
from dotenv import load_dotenv

from livekit import agents, rtc
from livekit.agents import AgentServer, AgentSession, Agent, room_io, TurnHandlingOptions
from livekit.plugins import google
from livekit.plugins import noise_cancellation
from livekit.plugins import silero

load_dotenv(Path(__file__).parent / ".env")

logger = logging.getLogger("shadowlearn-agent")


class ChineseTutorAgent(Agent):
    """AI agent that helps Chinese learners practice speaking through roleplay."""

    def __init__(self, instructions: str) -> None:
        super().__init__(
            instructions=instructions,
        )


server = AgentServer()


@server.rtc_session(agent_name="shadowlearn-speak")
async def shadowlearn_session(ctx: agents.JobContext):
    # Connect to the room first so we can access participant info
    await ctx.connect()

    # Wait for the user to join and read their metadata
    user = None
    for i in range(50):  # Wait up to 5 seconds
        for p in ctx.room.remote_participants.values():
            if p.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
                user = p
                break
        if user:
            break
        await agents.sleep(0.1)

    if not user:
        raise Exception("No user joined the room")

    user_identity = user.identity
    logger.info(f"[SESSION] User joined: {user_identity}")

    # Fix 5: Poll for attributes with retry (handles race condition)
    for _ in range(10):
        if user.attributes.get("persona_id") or user.attributes.get("situation_id"):
            break
        await asyncio.sleep(0.1)

    # Parse user metadata: "session_id=xxx,persona_id=xxx,situation_id=xxx,google_key=xxx"
    session_info = {}
    metadata = user.metadata or ""
    for item in metadata.split(","):
        if "=" in item:
            key, value = item.split("=", 1)
            session_info[key] = value

    # Also check attributes (may arrive after metadata)
    for key in ("persona_id", "situation_id", "google_key"):
        if key not in session_info and user.attributes.get(key):
            session_info[key] = user.attributes[key]

    persona_id = session_info.get("persona_id", "friendly_buddy")
    situation_id = session_info.get("situation_id", "casual_chat")
    google_key = session_info.get("google_key", "")

    if not google_key:
        raise Exception("No Google API key provided")

    # Read system_prompt from metadata (passed from frontend)
    system_prompt_encoded = session_info.get("system_prompt", "")
    system_prompt = unquote(system_prompt_encoded) if system_prompt_encoded else ""
    if not system_prompt:
        raise Exception("No system_prompt provided")

    instructions = system_prompt

    # Create session with Gemini Live API
    # Turn detection: Use Gemini's built-in VAD + adaptive interruption handling
    session = AgentSession(
        llm=google.realtime.RealtimeModel(
            api_key=google_key,
            model="gemini-2.5-flash-native-audio-preview-12-2025",
            voice="Zephyr",
        ),
        vad=silero.VAD.load(),
        user_away_timeout=15.0,
        turn_handling=TurnHandlingOptions(
            turn_detection="vad",
            endpointing={
                "min_delay": 0.3,
                "max_delay": 1.2,
            },
            interruption={
                "mode": "adaptive",
                "enabled": True,
                "min_duration": 0.2,
                "resume_false_interruption": True,
                "false_interruption_timeout": 1.5,
            },
        ),
    )

    # Fix 2: Shutdown when participant disconnects
    def on_participant_disconnected(p: rtc.RemoteParticipant):
        if p.identity == user_identity:
            logger.warning(f"[LIFECYCLE] {p.identity} disconnected — shutting down")
            session.shutdown()

    ctx.room.on("participant_disconnected", on_participant_disconnected)

    # Fix 4: Force room disconnect when session closes
    @session.on("close")
    def on_session_close(event):
        logger.warning(f"[SESSION] closed — reason={event.reason}, error={event.error}")
        asyncio.create_task(ctx.room.disconnect())
        ctx.shutdown()

    await session.start(
        room=ctx.room,
        agent=ChineseTutorAgent(instructions),
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: noise_cancellation.BVC()
                if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                else noise_cancellation.BVC(),
            ),
        ),
    )

    await session.generate_reply(
        instructions=f"Start a conversation in Chinese for the situation: {situation_id}. Greet the user warmly."
    )


if __name__ == "__main__":
    agents.cli.run_app(server)
