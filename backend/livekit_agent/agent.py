"""
ShadowLearn Voice Agent for Speak with AI feature.

This agent handles real-time voice conversations with students practicing Chinese.
Uses OpenAI Realtime API with persona-driven character corrections.
"""

from dotenv import load_dotenv

from livekit import agents
from livekit.agents import AgentServer, AgentSession, Agent, room_io
from livekit.plugins import openai as openai_plugin
from livekit.plugins import ai_coustics

load_dotenv(".env.local")


class ChineseTutorAgent(Agent):
    """AI agent that helps Chinese learners practice speaking through roleplay.
    
    The agent plays a character (from persona config) and provides in-character
    corrections when the learner makes mistakes.
    """
    
    def __init__(self, instructions: str) -> None:
        super().__init__(
            instructions=instructions,
        )


def create_agent_server():
    """Create and configure the LiveKit Agent server."""
    
    server = AgentServer()

    @server.rtc_session(agent_name="shadowlearn-speak")
    async def shadowlearn_session(ctx: agents.JobContext):
        # Read session metadata from job
        metadata = ctx.job.metadata or ""
        
        # Parse metadata: "session_id=xxx,persona_id=xxx,situation_id=xxx,openai_key=xxx"
        session_info = {}
        for item in metadata.split(","):
            if "=" in item:
                key, value = item.split("=", 1)
                session_info[key] = value
        
        persona_id = session_info.get("persona_id", "friendly_student")
        situation_id = session_info.get("situation_id", "casual_chat")
        openai_key = session_info.get("openai_key", "")
        
        # Load persona instructions from backend API
        # For now, use default instructions if import fails
        try:
            from app.speak.personas import get_persona
            persona = get_persona(persona_id)
            instructions = persona.get("system_prompt", "") if persona else ""
        except ImportError:
            instructions = ""
        
        if not instructions:
            instructions = """You are a friendly Chinese tutor helping a student 
practice conversational Chinese. Be encouraging, patient, and provide gentle 
corrections when they make mistakes. Keep conversations natural and fun."""
        
        # Create session with OpenAI Realtime API (from user's key in token)
        # The API key is embedded in the join token by the backend
        session = AgentSession(
            llm=openai_plugin.realtime.RealtimeModel(
                api_key=openai_key,
                voice="coral"  # OpenAI Realtime voice
            )
        )

        await session.start(
            room=ctx.room,
            agent=ChineseTutorAgent(instructions),
            room_options=room_io.RoomOptions(
                audio_input=room_io.AudioInputOptions(
                    noise_cancellation=ai_coustics.audio_enhancement(
                        model=ai_coustics.EnhancerModel.QUAIL_VF_L
                    ),
                ),
            ),
        )

        # Connect and start conversation
        await ctx.connect()
        
        # Generate initial greeting based on situation
        await session.generate_reply(
            instructions=f"Start a conversation in Chinese for the situation: {situation_id}. "
                         f"Greet the user warmly and set up the scene."
        )


    return server


if __name__ == "__main__":
    server = create_agent_server()
    agents.cli.run_app(server)