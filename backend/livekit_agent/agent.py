"""
ShadowLearn Voice Agent for Speak with AI feature.

This agent handles real-time voice conversations with students practicing Chinese.
Uses Google Gemini Live API with persona-driven character corrections.
"""

from pathlib import Path
from dotenv import load_dotenv

from livekit import agents, rtc
from livekit.agents import AgentServer, AgentSession, Agent, room_io
from livekit.plugins import google
from livekit.plugins import noise_cancellation
from livekit.plugins import silero

load_dotenv(Path(__file__).parent / ".env")


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
            # Skip agents - look for the human user
            if p.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
                user = p
                break
        if user:
            break
        await agents.sleep(0.1)

    if not user:
        raise Exception("No user joined the room")

    # Parse user metadata: "session_id=xxx,persona_id=xxx,situation_id=xxx,google_key=xxx"
    session_info = {}
    if user.metadata:
        for item in user.metadata.split(","):
            if "=" in item:
                key, value = item.split("=", 1)
                session_info[key] = value

    persona_id = session_info.get("persona_id", "friendly_buddy")
    situation_id = session_info.get("situation_id", "casual_chat")
    google_key = session_info.get("google_key", "")

    if not google_key:
        raise Exception("No Google API key provided")

    # Load persona instructions
    instructions = ""
    try:
        from app.speak.personas import get_persona
        persona = get_persona(persona_id)
        instructions = persona.get("system_prompt", "") if persona else ""
    except ImportError:
        pass

    if not instructions:
        instructions = """You are a friendly Chinese tutor helping a student
practice conversational Chinese. Be encouraging, patient, and provide gentle
corrections when they make mistakes. Keep conversations natural and fun."""

    # Create session with Gemini Live API
    session = AgentSession(
        llm=google.realtime.RealtimeModel(
            api_key=google_key,
            model="gemini-2.5-flash-native-audio-preview-12-2025",
            voice="Zephyr",
        ),
        vad=silero.VAD.load(),
    )

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
