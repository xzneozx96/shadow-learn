"""
ShadowLearn Voice Agent for Speak with AI feature.

This agent handles real-time voice conversations with students practicing Chinese.
Uses a multi-agent architecture:
- PersonaAgent: Main voice agent that speaks in character
- ObserverAgent: Parallel agent that monitors grammar/suggestions

Based on the Doheny Surf Desk pattern.
"""
import asyncio
import json
import logging
import os
from pathlib import Path
from urllib.parse import unquote
from dotenv import load_dotenv

from livekit import agents, rtc
from livekit.agents import AgentServer, AgentSession, room_io, TurnHandlingOptions
from livekit.agents.voice import Agent
from google.genai import types as genai_types
from livekit.plugins import google, openai
from livekit.plugins import noise_cancellation
from livekit.plugins import silero

from userdata import SpeakSessionData
from agents import PersonaAgent, start_observer

load_dotenv(Path(__file__).parent / ".env")

logger = logging.getLogger("shadowlearn-agent")


# Initialize the LiveKit agent server
server = AgentServer()


@server.rtc_session(agent_name="shadowlearn-speak")
async def shadowlearn_session(ctx: agents.JobContext):
    """Main session handler for Speak with AI voice practice.

    This function:
    1. Connects to the LiveKit room
    2. Extracts user metadata (persona, situation, API keys)
    3. Creates AgentSession with main PersonaAgent
    4. Starts ObserverAgent in parallel
    5. Handles lifecycle (connect, disconnect, errors)
    """
    # Connect to the room
    await ctx.connect()
    logger.info(f"[SESSION] Room connected: {ctx.room.name}")

    # Wait for user to join
    user = None
    for _ in range(50):
        for p in ctx.room.remote_participants.values():
            if p.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
                user = p
                break
        if user:
            break
        await asyncio.sleep(0.1)

    if not user:
        raise Exception("No user joined the room")

    user_identity = user.identity
    logger.info(f"[SESSION] User joined: {user_identity}")

    # Wait for attributes
    for _ in range(10):
        if user.attributes.get("persona_id") or user.attributes.get("situation_id"):
            break
        await asyncio.sleep(0.1)

    # Parse user metadata
    session_info = {}
    metadata = user.metadata or ""
    for item in metadata.split(","):
        if "=" in item:
            key, value = item.split("=", 1)
            session_info[key] = value

    # Check attributes
    for key in ("persona_id", "situation_id", "google_key", "openai_key"):
        if key not in session_info and user.attributes.get(key):
            session_info[key] = user.attributes[key]

    # Extract configuration
    persona_id = session_info.get("persona_id", "friendly_buddy")
    situation_id = session_info.get("situation_id", "casual_chat")

    # Get API keys - prefer OpenAI for observer, fallback to Google for main.
    # google_key is URL-encoded by the router (quote()) so unquote on read.
    google_key_raw = session_info.get("google_key", "")
    google_key = unquote(google_key_raw) if google_key_raw else os.getenv("GOOGLE_API_KEY", "")
    openai_key_raw = session_info.get("openai_key", "")
    openai_key = unquote(openai_key_raw) if openai_key_raw else os.getenv("OPENAI_API_KEY", "")

    if not google_key and not openai_key:
        raise Exception("No API key provided (google_key or openai_key)")

    # System prompt and voice
    system_prompt_encoded = session_info.get("system_prompt", "")
    system_prompt = unquote(system_prompt_encoded) if system_prompt_encoded else ""

    if not system_prompt:
        raise Exception("No system_prompt provided")

    voice_id_encoded = session_info.get("voice_id", "")
    voice_id = unquote(voice_id_encoded) if voice_id_encoded else "Puck"

    logger.info(f"[SESSION] Config: persona={persona_id}, situation={situation_id}, voice={voice_id}")

    # Create session userdata
    userdata = SpeakSessionData(
        persona_id=persona_id,
        situation_id=situation_id,
        system_prompt=system_prompt,
        voice_id=voice_id,
    )

    # Parse extended metadata fields into userdata
    for k, v in session_info.items():
        if k == "situation_config":
            try:
                from urllib.parse import unquote as _unquote
                import json as _json
                from types import SimpleNamespace as _SN
                situation_json = _unquote(v)
                raw = _json.loads(situation_json)
                # Normalize vocab: accept both new {term, meaning} shape and
                # legacy plain-string shape. Downstream consumers expect
                # plain strings for prompts; meanings are UI-only.
                raw_vocab = raw.get("target_vocab", [])
                vocab_terms = [
                    v["term"] if isinstance(v, dict) else str(v)
                    for v in raw_vocab
                ]
                userdata.situation_config = _SN(
                    id=raw["id"],
                    title=raw["title"],
                    ai_role=raw["ai_role"],
                    scene_context=raw["scene_context"],
                    opening_line=raw["opening_line"],
                    user_goal=raw["user_goal"],
                    target_vocab=vocab_terms,
                    language=raw["language"],
                    level_label=raw.get("level_label", ""),
                    interface_language=raw.get("interface_language", "en"),
                )
                userdata.target_language = raw["language"]
            except Exception as exc:
                logger.error(f"Failed to parse situation_config metadata: {exc}")
        elif k == "target_language":
            userdata.target_language = v
        elif k == "proficiency_level":
            userdata.proficiency_level = v

    # Create AgentSession
    # Note: Using Google Gemini Realtime for main voice
    # Could alternatively use OpenAI Realtime
    if google_key:
        llm = google.realtime.RealtimeModel(
            api_key=google_key,
            model="gemini-2.5-flash-native-audio-preview-12-2025",
            voice=voice_id,
            # Forces api_version="v1alpha", required by the native-audio preview endpoint.
            enable_affective_dialog=True,
            realtime_input_config=genai_types.RealtimeInputConfig(
                automatic_activity_detection=genai_types.AutomaticActivityDetection(
                    # Quick pickup — learners use short affirmations ("好", "嗯")
                    start_of_speech_sensitivity=genai_types.StartSensitivity.START_SENSITIVITY_HIGH,
                    # Don't cut them off mid-sentence; learners pause more than native speakers
                    end_of_speech_sensitivity=genai_types.EndSensitivity.END_SENSITIVITY_HIGH,
                    prefix_padding_ms=200,   # commit speech start after 200ms
                    silence_duration_ms=1200, # 1.2s silence to commit end-of-speech
                ),
                activity_handling=genai_types.ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
            ),
        )
    else:
        # Fallback: Use OpenAI Realtime
        # Note: This requires OpenAI Realtime-capable model
        llm = openai.realtime.RealtimeModel(
            api_key=openai_key,
            model="gpt-4o-realtime-preview",
            voice="verse",
        )

    session = AgentSession[SpeakSessionData](
        userdata=userdata,
        vad=silero.VAD.load(),
        llm=llm,
        user_away_timeout=15.0,
    )

    # Start Observer agent in parallel
    # Use separate LLM for observer (can be different model)
    observer_llm = google.LLM(
        model="gemini-3.1-flash-lite-preview",
        api_key=google_key or os.getenv("GOOGLE_API_KEY", ""),
    )

    # Start Observer agent (pronunciation removed - not feasible with OpenAI Realtime)
    observer = await start_observer(
        session=session,
        llm=observer_llm,
    )

    # Handle disconnect
    def on_participant_disconnected(p: rtc.RemoteParticipant):
        if p.identity == user_identity:
            logger.warning(f"[LIFECYCLE] {p.identity} disconnected — shutting down")
            session.shutdown()

    ctx.room.on("participant_disconnected", on_participant_disconnected)

    # Handle session close — evaluate before disconnecting so the RPC can deliver
    @session.on("close")
    def on_session_close(event):
        logger.warning(f"[SESSION] closed — reason={event.reason}, error={event.error}")
        
        # Try to notify frontend while room is still connected
        # We need to run async code in sync callback - use create_task but fire notification first
        async def _notify_and_evaluate():
            try:
                room = ctx.room
                remote_participants = list(room.remote_participants.values())
                if remote_participants:
                    target_identity = remote_participants[0].identity
                    await room.local_participant.perform_rpc(
                        destination_identity=target_identity,
                        method="session_evaluation_started",
                        payload=json.dumps({"started": True}),
                    )
                    logger.info("[SESSION] Notified frontend: evaluation starting")
            except Exception as e:
                logger.warning(f"[SESSION] Failed to notify frontend: {e}")
            
            # Now run evaluation
            try:
                evaluation = await observer.evaluate_session()
                await observer._stream_feedback({
                    "type": "session-evaluation",
                    **evaluation,
                })
            except Exception as e:
                logger.error(f"[SESSION] Evaluation failed: {e}")
            finally:
                await ctx.room.disconnect()
                ctx.shutdown()
        
        asyncio.create_task(_notify_and_evaluate())
    
    # Start session with PersonaAgent.
    # PersonaAgent.on_enter() fires the opening line from situation_config.
    # Do NOT call session.generate_reply() here — that produces a second
    # greeting and ignores the selected language/situation.
    await session.start(
        room=ctx.room,
        agent=PersonaAgent(instructions=system_prompt),
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: noise_cancellation.BVC()
                if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                else noise_cancellation.BVC(),
            ),
        ),
    )

async def _evaluate_and_disconnect(observer, ctx) -> None:
    """Run session evaluation, stream result, then disconnect the room."""
    # Send notification FIRST (before any await) so frontend knows evaluation is starting
    try:
        room = ctx.room
        remote_participants = list(room.remote_participants.values())
        if remote_participants:
            target_identity = remote_participants[0].identity
            await room.local_participant.perform_rpc(
                destination_identity=target_identity,
                method="session_evaluation_started",
                payload=json.dumps({"started": True}),
            )
            logger.info("[SESSION] Notified frontend: evaluation starting")
    except Exception as e:
        logger.warning(f"[SESSION] Failed to notify frontend: {e}")
    
    try:
        evaluation = await observer.evaluate_session()
        await observer._stream_feedback({
            "type": "session-evaluation",
            **evaluation,
        })
    except Exception as e:
        logger.error(f"[SESSION] Evaluation failed: {e}")
    finally:
        await ctx.room.disconnect()
        ctx.shutdown()


if __name__ == "__main__":
    agents.cli.run_app(server)