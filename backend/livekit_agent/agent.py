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
from livekit.agents import AgentServer, AgentSession, JobProcess, room_io
from livekit.plugins import google, speechmatics
from livekit.plugins import noise_cancellation
from livekit.plugins import silero

from userdata import SpeakSessionData
from agents import PersonaAgent, start_observer

load_dotenv(Path(__file__).parent / ".env")

logger = logging.getLogger("shadowlearn-agent")


def prewarm(proc: JobProcess) -> None:
    # Strip inherited StreamHandler from child process root logger.
    # Child has both StreamHandler (writes stderr directly) and LogQueueHandler
    # (ships to parent which emits via its own StreamHandler) — that double-prints
    # every log line. Keep only LogQueueHandler so logs flow once via parent.
    root = logging.getLogger()
    for h in list(root.handlers):
        if h.__class__.__name__ == "StreamHandler":
            root.removeHandler(h)

    proc.userdata["vad"] = silero.VAD.load()


# Initialize the LiveKit agent server
# num_idle_processes=1: dev mode defaults to 0 (no warm processes), causing a 4s
# cold-start delay on every session. Keep 1 warm process ready at all times.
server = AgentServer(setup_fnc=prewarm, num_idle_processes=1)


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

    user = await ctx.wait_for_participant(
        kind=rtc.ParticipantKind.PARTICIPANT_KIND_STANDARD
    )

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
    target_language = session_info.get("target_language", "zh-CN")

    # Get API keys - prefer OpenAI for observer, fallback to Google for main.
    # google_key is URL-encoded by the router (quote()) so unquote on read.
    google_key_raw = session_info.get("google_key", "")
    google_key = unquote(google_key_raw) if google_key_raw else os.getenv("GOOGLE_API_KEY", "")
    speechmatics_key = os.getenv("SPEECHMATICS_API_KEY", "")

    if not google_key:
        raise Exception("google_key required")

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

    if not speechmatics_key:
        raise Exception("speechmatics_key required")

    llm = google.LLM(
        model="gemini-3.1-flash-lite",
        api_key=google_key,
    )

    tts = google.beta.GeminiTTS(
        model="gemini-3.1-flash-tts-preview",
        voice_name=voice_id,
        api_key=google_key,
        instructions="Speak naturally and expressively as the character.",
    )

    # Speechmatics expects raw "cmn" for Mandarin, but livekit.agents.LanguageCode
    # normalizes "cmn" -> "zh" via the hard-coded ISO_639_3_TO_1 map in
    # livekit-agents/_language_data.py (introduced in PR #4926). Compound BCP-47
    # tags like "cmn-Hans-CN" preserve the subtag through normalization but
    # Speechmatics' server rejects compound forms with "lang pack not supported".
    # Workaround: pass a placeholder to the constructor, then mutate
    # _stt_options.language post-init with the raw "cmn" str. _prepare_config
    # reads opts.language directly, bypassing LanguageCode wrapping.
    _SM_LANG = {"zh-CN": "cmn", "en": "en", "ja": "ja"}
    sm_lang = _SM_LANG.get(target_language, "en")

    stt_model = speechmatics.STT(
        api_key=speechmatics_key,
        language="en",  # placeholder; overridden below
        turn_detection_mode=speechmatics.TurnDetectionMode.FIXED,
        end_of_utterance_silence_trigger=1.5,
        end_of_utterance_max_delay=5.0,
    )
    stt_model._stt_options.language = sm_lang  # type: ignore[assignment]

    session = AgentSession[SpeakSessionData](
        userdata=userdata,
        llm=llm,
        tts=tts,
        vad=ctx.proc.userdata.get("vad") or silero.VAD.load(),
        stt=stt_model,
    )

    # Start Observer agent in parallel
    # Use separate LLM for observer (can be different model)
    observer_llm = google.LLM(
        model="gemini-3.1-flash-lite",
        api_key=google_key,
    )

    # Pass ctx.room directly so the observer can deliver RPC without going through
    # session.room_io (which becomes unavailable after session.shutdown()).
    observer = await start_observer(
        session=session,
        llm=observer_llm,
        room=ctx.room,
    )

    # Handle disconnect — log only; room_io closes the session automatically
    # when the user participant leaves (CloseReason.PARTICIPANT_DISCONNECTED).
    def on_participant_disconnected(p: rtc.RemoteParticipant):
        if p.identity == user_identity:
            logger.warning(f"[LIFECYCLE] {p.identity} disconnected — shutting down")

    ctx.room.on("participant_disconnected", on_participant_disconnected)

    @session.on("close")
    def on_session_close(event):
        logger.warning(f"[SESSION] closed — reason={event.reason}, error={event.error}")

    # Frontend-initiated evaluation: the frontend calls performRpc before disconnecting.
    # The agent runs the LLM evaluation and returns JSON in the RPC response.
    # This keeps the user in the room until the evaluation is delivered.
    @ctx.room.local_participant.register_rpc_method("request_session_evaluation")
    async def _handle_eval_rpc(data):
        logger.info("[EVAL] Evaluation requested via RPC")
        # Returns None if no user turns (nothing meaningful to evaluate); fallback dict on LLM errors.
        evaluation = await observer.evaluate_session() if observer else None
        logger.info("[EVAL] Evaluation complete, returning to frontend")
        return json.dumps(evaluation)
    
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

if __name__ == "__main__":
    agents.cli.run_app(server)