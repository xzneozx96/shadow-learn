"""ObserverAgent for parallel conversation monitoring.

This agent runs in parallel with the main PersonaAgent and monitors
conversation transcripts for:
1. Grammar evaluation (LLM-based)
2. Pronunciation assessment (Azure Speech API)
3. Next line suggestions (LLM-based, after AI speaks)

Based on Doheny Surf Desk's ObserverAgent pattern.
"""
import asyncio
import json
import logging
from typing import Optional

from livekit.agents import ConversationItemAddedEvent
from livekit.agents.llm import ChatContext

from userdata import SpeakSessionData
from utils import load_prompt

logger = logging.getLogger("speak-with-ai.observer")


class ObserverAgent:
    """Parallel observer that monitors conversations for feedback.

    This agent does NOT join the main session as an active agent.
    Instead, it listens to session events and:
    - Evaluates grammar after user turns
    - Suggests next lines after AI turns
    - Injects correction hints into main agent's context
    - Streams feedback to frontend via text streams
    """

    def __init__(
        self,
        session,
        llm,
    ):
        """Initialize the observer agent.

        Args:
            session: AgentSession to monitor
            llm: LLM instance for evaluation (e.g., GPT-4o-mini)

        Note: Pronunciation assessment removed - not feasible with OpenAI Realtime.
        """
        self.session = session
        self.llm = llm

        # Load evaluation prompts
        self.observer_prompt = load_prompt("observer_prompt.yaml")

        # Conversation tracking
        self.conversation_history: list[dict] = []
        self.hints_sent: list[str] = []
        self.last_eval_transcript_count = 0

        # Evaluation settings
        self.eval_threshold = 1  # Evaluate every user turn
        self._evaluating = False

        self._setup_listeners()

        logger.info(
            f"ObserverAgent initialized: LLM={getattr(self.llm, 'model', 'custom')}, "
            f"eval_threshold={self.eval_threshold}"
        )

    def _setup_listeners(self) -> None:
        """Set up session event listeners."""

        @self.session.on("conversation_item_added")
        def conversation_item_added(event: ConversationItemAddedEvent):
            """Handle new conversation items.

            Triggers:
            - Grammar + Pronunciation evaluation after USER turns
            - Next line suggestion after AI (assistant) turns
            """
            # Skip non-message items (like AgentHandoff)
            if not hasattr(event.item, "content"):
                logger.debug(f"[OBSERVER] Skipping non-message item: {type(event.item).__name__}")
                return

            # Extract transcript text from the item
            transcript_text = ""
            for content in event.item.content:
                if isinstance(content, str):
                    transcript_text += content

            if not transcript_text:
                return

            # Track conversation history
            self.conversation_history.append({
                "text": transcript_text,
                "role": event.item.role,
            })

            # Route to appropriate handler based on speaker
            if event.item.role == "user":
                logger.info(f"[OBSERVER] User turn: {transcript_text[:50]}...")
                self._handle_user_turn(transcript_text)

            elif event.item.role == "assistant":
                logger.info(f"[OBSERVER] AI turn: {transcript_text[:50]}...")
                self._handle_ai_turn(transcript_text)

    def _handle_user_turn(self, transcript: str) -> None:
        """Handle user turn - trigger grammar evaluation."""
        total_segments = len(self.conversation_history)
        new_segments = total_segments - self.last_eval_transcript_count

        if new_segments >= self.eval_threshold:
            # Fire and forget - don't block the voice loop
            asyncio.create_task(self._evaluate_user_turn(transcript))
            self.last_eval_transcript_count = total_segments

    def _handle_ai_turn(self, transcript: str) -> None:
        """Handle AI turn - trigger next line suggestion."""
        # Suggest next line after AI speaks (to help user respond)
        asyncio.create_task(self._suggest_next_line())

    async def _evaluate_user_turn(self, user_transcript: str) -> None:
        """Evaluate user's grammar.

        This runs asynchronously and:
        1. Calls LLM for grammar evaluation
        2. Streams results to frontend
        3. Injects correction hints to main agent

        Note: Pronunciation assessment removed - not feasible with OpenAI Realtime
        due to lack of audio-text pairing. Re-evaluate in future with:
        - Post-session pronunciation
        - External STT with timestamps
        - LLM-based estimation
        """
        if self._evaluating:
            return

        self._evaluating = True

        try:
            # Grammar evaluation only (pronunciation removed)
            grammar_result = await self._analyze_grammar(user_transcript)

            # Handle grammar results
            if isinstance(grammar_result, Exception):
                logger.error(f"Grammar evaluation failed: {grammar_result}")
            elif grammar_result:
                # Stream to frontend
                await self._stream_feedback({
                    "type": "grammar",
                    "transcript": user_transcript,
                    "issues": grammar_result.get("issues", []),
                })

                # Inject hint to main agent if there are issues
                if grammar_result.get("issues"):
                    await self._inject_correction_hint(grammar_result)

        except Exception as e:
            logger.error(f"Error during user turn evaluation: {e}", exc_info=True)
        finally:
            self._evaluating = False

    async def _analyze_grammar(self, text: str) -> Optional[dict]:
        """Analyze grammar using LLM.

        Args:
            text: User's transcript

        Returns:
            Dict with 'issues' list or None on error
        """
        # Build context for grammar evaluation
        conversation_text = "\n".join([
            f"{msg['role']}: {msg['text']}"
            for msg in self.conversation_history[-5:]
        ])

        # Format prompt
        try:
            userdata = self.session.userdata
            language = getattr(userdata, "target_language", "zh-CN")
            level = getattr(userdata, "proficiency_level", "intermediate")
            config = getattr(userdata, "situation_config", None)
            proficiency_label = getattr(config, "level_label", "") if config else ""
        except Exception:
            language = "zh-CN"
            level = "intermediate"
            proficiency_label = ""

        context = {
            "conversation_text": conversation_text,
            "user_turn": text,
            "language": language,
            "level": level,
            "proficiency_label": proficiency_label or "general",
        }

        try:
            prompt = load_prompt("grammar_prompt.yaml")
            if not prompt:
                logger.warning("Grammar prompt not found, skipping evaluation")
                return None

            formatted_prompt = prompt.format(**context)

        except KeyError as e:
            logger.error(f"Missing key in grammar prompt: {e}")
            return None

        # Call LLM
        chat_ctx = ChatContext()
        chat_ctx.add_message(role="user", content=formatted_prompt)

        response_text = ""
        async with self.llm.chat(chat_ctx=chat_ctx) as stream:
            async for chunk in stream:
                if chunk.delta and chunk.delta.content:
                    response_text += chunk.delta.content

        if not response_text:
            return None

        # Parse JSON response
        try:
            result = json.loads(response_text.strip())
            logger.info(f"[OBSERVER] Grammar evaluation: {len(result.get('issues', []))} issues found")
            return result
        except json.JSONDecodeError:
            # Try to extract JSON from response
            start = response_text.find('{')
            end = response_text.rfind('}') + 1
            if start >= 0 and end > start:
                try:
                    result = json.loads(response_text[start:end])
                    return result
                except json.JSONDecodeError:
                    pass
            logger.error(f"[OBSERVER] Failed to parse grammar response: {response_text[:100]}")
            return None

    # Pronunciation assessment removed - not feasible with OpenAI Realtime
    # Kept as placeholder for future implementation options:
    # - Post-session pronunciation with session recording
    # - External STT with timestamps
    # - LLM-based estimation
    
    async def _assess_pronunciation(self, text: str) -> Optional[dict]:
        """Placeholder - pronunciation not implemented."""
        logger.debug("Pronunciation skipped - not available with OpenAI Realtime")
        return None

    async def _suggest_next_line(self) -> None:
        """Suggest what the user could say next.

        Called after AI speaks, to help user respond.
        """
        # Get conversation context
        conversation_text = "\n".join([
            f"{msg['role']}: {msg['text']}"
            for msg in self.conversation_history[-6:]
        ])

        # Get userdata for situation info
        try:
            userdata = self.session.userdata
            config = getattr(userdata, "situation_config", None)
            if config:
                situation_description = config.scene_context
                user_goal = config.user_goal
                target_vocab = ", ".join(config.target_vocab) if config.target_vocab else ""
            else:
                situation_description = userdata.situation_id or "casual chat"
                user_goal = ""
                target_vocab = ""
            persona_id = userdata.persona_id or "friendly buddy"
            language = getattr(userdata, "target_language", "zh-CN")
            level = getattr(userdata, "proficiency_level", "intermediate")
        except Exception:
            situation_description = "casual chat"
            user_goal = ""
            target_vocab = ""
            persona_id = "friendly buddy"
            language = "zh-CN"
            level = "intermediate"

        context = {
            "conversation_text": conversation_text,
            "situation_description": situation_description,
            "user_goal": user_goal,
            "target_vocab": target_vocab,
            "persona_name": persona_id,
            "language": language,
            "level": level,
        }

        try:
            prompt = load_prompt("suggestion_prompt.yaml")
            if not prompt:
                logger.warning("Suggestion prompt not found")
                return

            formatted_prompt = prompt.format(**context)

        except KeyError as e:
            logger.error(f"Missing key in suggestion prompt: {e}")
            return

        # Call LLM
        chat_ctx = ChatContext()
        chat_ctx.add_message(role="user", content=formatted_prompt)

        response_text = ""
        async with self.llm.chat(chat_ctx=chat_ctx) as stream:
            async for chunk in stream:
                if chunk.delta and chunk.delta.content:
                    response_text += chunk.delta.content

        if not response_text:
            return

        # Parse JSON response
        try:
            result = json.loads(response_text.strip())
            logger.info(f"[OBSERVER] Next line suggestion: {result.get('suggestion', '')[:30]}...")

            # Stream to frontend
            await self._stream_feedback({
                "type": "next-line",
                "suggestion": result.get("suggestion", ""),
                "pinyin": result.get("pinyin", ""),
                "translation": result.get("translation", ""),
            })

        except json.JSONDecodeError:
            start = response_text.find('{')
            end = response_text.rfind('}') + 1
            if start >= 0 and end > start:
                try:
                    result = json.loads(response_text[start:end])
                    await self._stream_feedback({
                        "type": "next-line",
                        "suggestion": result.get("suggestion", ""),
                        "pinyin": result.get("pinyin", ""),
                    })
                except json.JSONDecodeError:
                    pass

    async def _inject_correction_hint(self, grammar_result: dict) -> None:
        """Inject a correction hint into main agent's context.

        Args:
            grammar_result: Grammar evaluation result with issues
        """
        if not hasattr(self.session, "current_agent") or not self.session.current_agent:
            logger.warning("No active agent to inject hint")
            return

        current_agent = self.session.current_agent

        # Build correction hint
        issues = grammar_result.get("issues", [])
        if not issues:
            return

        first_issue = issues[0]
        hint = f"""[CORRECTION]: {first_issue.get('correction', '')}

Explanation: {first_issue.get('explanation', '')}

Please acknowledge naturally and restate correctly in your response."""

        logger.info(f"[OBSERVER] Injecting hint: {hint[:80]}...")

        # Copy context and add hint
        ctx_copy = current_agent.chat_ctx.copy()
        ctx_copy.add_message(role="system", content=hint)

        try:
            await current_agent.update_chat_ctx(ctx_copy)
            logger.info("[OBSERVER] Hint injected successfully")
        except Exception as e:
            logger.error(f"Failed to inject hint: {e}")

    async def _stream_feedback(self, data: dict) -> None:
        """Stream feedback data to frontend via RPC.

        Args:
            data: Feedback data to send (grammar issues or next-line suggestion)
        """
        # Get room via room_io (LiveKit 1.x pattern)
        try:
            room = self.session.room_io.room
        except (AttributeError, RuntimeError) as e:
            logger.warning(f"No room available for streaming: {e}")
            return

        if not hasattr(room, "local_participant"):
            logger.warning("No local participant to send text")
            return

        # Find the frontend participant
        remote_participants = list(room.remote_participants.values())
        if not remote_participants:
            logger.warning("No remote participants to send feedback")
            return

        # Send to the first remote participant
        target_identity = remote_participants[0].identity

        try:
            payload = json.dumps(data)
            method_name = "grammar_feedback" if data["type"] == "grammar" else "next_line_suggestion"

            await room.local_participant.perform_rpc(
                destination_identity=target_identity,
                method=method_name,
                payload=payload,
            )
            logger.info(f"[OBSERVER] RPC {data['type']} to {target_identity}")

        except Exception as e:
            logger.error(f"Failed to stream feedback via RPC: {e}")


async def start_observer(
    session,
    llm,
) -> ObserverAgent:
    """Start the observer agent for a session.

    Args:
        session: AgentSession to monitor
        llm: LLM instance for evaluation

    Returns:
        ObserverAgent instance

    Note: Pronunciation assessment removed - not feasible with OpenAI Realtime.
    """
    observer = ObserverAgent(
        session=session,
        llm=llm,
    )
    logger.info("Observer agent started")
    return observer