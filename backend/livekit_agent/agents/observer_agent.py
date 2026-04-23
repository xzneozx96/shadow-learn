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

_LOCALE_TO_LANGUAGE_NAME = {
    "en": "English",
    "vi": "Vietnamese",
}


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
        self.last_eval_transcript_count = 0

        # Evaluation settings
        self.eval_threshold = 1  # Evaluate every user turn
        self._evaluating = False

        # Correction rate-limiting (DYNAMIC based on error type)
        self._turn_count: int = 0
        self._last_correction_turn: int = -3  # start ready to correct
        self._correction_cooldown: int = 1  # Now dynamic - see _inject_correction_hint
        self._last_correction_types: set[str] = set()  # Track error types already corrected
        self._turn_count_for_reset: Optional[int] = None  # When to reset tracking

        # Vocabulary tracking
        self._target_vocab: list[str] = []
        self._used_vocab: set[str] = set()
        self._turns_since_vocab_check: int = 0

        self._setup_listeners()

        logger.info(
            f"ObserverAgent initialized: LLM={getattr(self.llm, 'model', 'custom')}, "
            f"eval_threshold={self.eval_threshold}"
        )

    def initialize_from_userdata(self) -> None:
        """Load target vocabulary from session userdata."""
        try:
            userdata = self.session.userdata
            config = getattr(userdata, "situation_config", None)
            if config:
                target_vocab = getattr(config, "target_vocab", [])
                if target_vocab:
                    # Accept both list of strings and list of dicts
                    self._target_vocab = [
                        v["term"] if isinstance(v, dict) else str(v)
                        for v in target_vocab
                    ]
                    logger.info(f"[OBSERVER] Loaded {len(self._target_vocab)} target vocab words")
        except Exception as e:
            logger.warning(f"[OBSERVER] Could not load target vocab: {e}")

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
        self._turn_count += 1
        
        # Reset correction tracking after 2 turns
        if self._turn_count_for_reset and self._turn_count >= self._turn_count_for_reset:
            self._last_correction_types.clear()
            self._turn_count_for_reset = None
            logger.info("[OBSERVER] Correction tracking reset")
        
        total_segments = len(self.conversation_history)
        new_segments = total_segments - self.last_eval_transcript_count

        if new_segments >= self.eval_threshold:
            # Fire and forget - don't block the voice loop
            asyncio.create_task(self._evaluate_user_turn(transcript))
            self.last_eval_transcript_count = total_segments

        # Check for cultural moments every 3 turns (throttled)
        if self._turn_count % 3 == 0:
            asyncio.create_task(self._trigger_cultural_check(transcript))
            asyncio.create_task(self._trigger_vocab_check(transcript))

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
                # Always stream to frontend (feedback panel)
                await self._stream_feedback({
                    "type": "grammar",
                    "transcript": user_transcript,
                    "issues": grammar_result.get("issues", []),
                })

                # Inject correction into main agent only if cooldown has passed
                turns_since_last = self._turn_count - self._last_correction_turn
                if grammar_result.get("issues") and turns_since_last >= self._correction_cooldown:
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
            for msg in self.conversation_history
        ])

        # Format prompt
        try:
            userdata = self.session.userdata
            language = getattr(userdata, "target_language", None) or "zh-CN"
            level = getattr(userdata, "proficiency_level", "intermediate")
            config = getattr(userdata, "situation_config", None)
            if config:
                proficiency_label = getattr(config, "level_label", "") or "general"
                interface_language = getattr(config, "interface_language", "vi")
            else:
                proficiency_label = "general"
                interface_language = "vi"
        except Exception:
            language = "zh-CN"
            level = "intermediate"
            proficiency_label = "general"
            interface_language = "vi"

        context = {
            "conversation_text": conversation_text,
            "user_turn": text,
            "language": language,
            "level": level,
            "proficiency_label": proficiency_label,
            "interface_language": _LOCALE_TO_LANGUAGE_NAME.get(interface_language, interface_language),
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
            for msg in self.conversation_history
        ])

        # Get userdata for situation info
        try:
            userdata = self.session.userdata
            config = getattr(userdata, "situation_config", None)
            if config:
                situation_description = config.scene_context
                user_goal = config.user_goal
                target_vocab = ", ".join(config.target_vocab) if config.target_vocab else ""
                interface_language = config.interface_language or "vi"
            else:
                situation_description = userdata.situation_id or "casual_chat"
                user_goal = ""
                target_vocab = ""
                interface_language = "vi"
            persona_id = userdata.persona_id or "friendly_buddy"
            target_language = getattr(userdata, "target_language", None) or "zh-CN"
            level = getattr(userdata, "proficiency_level", "intermediate")
        except Exception:
            situation_description = "casual_chat"
            user_goal = ""
            target_vocab = ""
            persona_id = "friendly_buddy"
            target_language = "zh-CN"
            level = "intermediate"
            interface_language = "vi"

        context = {
            "conversation_text": conversation_text,
            "situation_description": situation_description,
            "user_goal": user_goal,
            "target_vocab": target_vocab,
            "persona_name": persona_id,
            "target_language": target_language,
            "interface_language": _LOCALE_TO_LANGUAGE_NAME.get(interface_language, interface_language),
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
                "romanization": result.get("romanization", ""),
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
                        "romanization": result.get("romanization", ""),
                        "translation": result.get("translation", ""),
                    })
                except json.JSONDecodeError:
                    pass

    async def _detect_cultural_moment(self, transcript: str) -> Optional[dict]:
        """LLM-powered cultural moment detection."""
        
        CULTURAL_PROMPT = """You are a cultural guide for language learning.

CONVERSATION:
{conversation}

Analyze the LAST USER message for cultural moments. Look for:
1. Greeting patterns that aren't literal (e.g., "你吃了吗" = "How are you?")
2. Politeness markers (e.g., "辛苦啦", "有空来玩")  
3. Context-dependent meanings
4. Cultural assumptions in what was said

If there's a cultural moment in the last user message, respond with:
{{"has_cultural": true, "phrase": "...", "explanation": "..."}}

If no cultural moment, respond with:
{{"has_cultural": false}}
"""

        # Build conversation context (last 3 turns)
        conv = "\n".join([
            f"{m['role']}: {m['text'][:100]}"
            for m in self.conversation_history[-3:]
        ])
        
        prompt = CULTURAL_PROMPT.format(conversation=conv)
        
        chat_ctx = ChatContext()
        chat_ctx.add_message(role="user", content=prompt)
        
        response = ""
        async with self.llm.chat(chat_ctx=chat_ctx) as stream:
            async for chunk in stream:
                if chunk.delta and chunk.delta.content:
                    response += chunk.delta.content
        
        if not response:
            return None
        
        try:
            result = json.loads(response.strip())
            if result.get("has_cultural"):
                return {
                    "type": "cultural-tip",
                    "phrase": result.get("phrase", ""),
                    "explanation": result.get("explanation", ""),
                }
        except json.JSONDecodeError:
            pass
        
        return None

    async def _trigger_cultural_check(self, transcript: str) -> None:
        """Trigger cultural check and stream result."""
        try:
            cultural = await self._detect_cultural_moment(transcript)
            if cultural:
                await self._stream_feedback(cultural)
                logger.info(f"[OBSERVER] Cultural tip: {cultural.get('explanation', '')[:50]}...")
        except Exception as e:
            logger.error(f"Cultural check failed: {e}")

    async def _trigger_vocab_check(self, transcript: str) -> None:
        """Check vocab usage and prompt if needed."""
        self._turns_since_vocab_check += 1
        
        # Check every 3-4 turns
        if self._turns_since_vocab_check < 3:
            return
        
        self._turns_since_vocab_check = 0
        
        # Check which target vocab was used
        for word in self._target_vocab:
            if word.lower() in transcript.lower():
                self._used_vocab.add(word)
        
        # Find unused target vocab
        unused = [w for w in self._target_vocab if w not in self._used_vocab]
        if not unused:
            return
        
        # LLM-powered vocab suggestion
        VOCAB_PROMPT = """The learner is practicing. Target vocabulary: {target_vocab}

Recent conversation:
{conversation}

Which target word is most natural to use in the NEXT response?
Respond with:
{{"suggests_vocab": true, "word": "...", "reason": "..."}}

If none fit naturally:
{{"suggests_vocab": false}}
"""
        
        conv = "\n".join([f"{m['role']}: {m['text'][:80]}" for m in self.conversation_history[-3:]])
        prompt = VOCAB_PROMPT.format(
            target_vocab=", ".join(unused[:3]),
            conversation=conv
        )
        
        chat_ctx = ChatContext()
        chat_ctx.add_message(role="user", content=prompt)
        
        response = ""
        async with self.llm.chat(chat_ctx=chat_ctx) as stream:
            async for chunk in stream:
                if chunk.delta and chunk.delta.content:
                    response += chunk.delta.content
        
        if not response:
            return
        
        try:
            result = json.loads(response.strip())
            if result.get("suggests_vocab"):
                await self._stream_feedback({
                    "type": "vocab-tip",
                    "word": result.get("word", ""),
                    "reason": result.get("reason", ""),
                })
                logger.info(f"[OBSERVER] Vocab tip: {result.get('word', '')}")
        except json.JSONDecodeError:
            pass

    async def _inject_correction_hint(self, grammar_result: dict) -> None:
        """Inject a correction hint via update_chat_ctx as a user-role message.

        DYNAMIC BEHAVIOR:
        - If learner makes a NEW error type → correct immediately
        - If learner repeats the SAME error within 2 turns → correct immediately  
        - Only skip if exact same correction was already given in last turn

        Why user-role (not assistant/model):
        Gemini Live API requires alternating user/model turns. At injection time,
        the AI has already auto-responded to the user's last utterance, so the last
        turn is model-role. Appending another model-role turn → consecutive model →
        1008 policy violation. Injecting as user-role maintains valid alternation.

        Why not update_instructions():
        That sends LiveClientContent with role=None (system-level mid-session
        update), which Gemini native audio models reject with 1008.

        The cue is framed as an external teacher hint so the AI treats it as a
        directive for its next response rather than something it "said".
        """
        if not hasattr(self.session, "current_agent") or not self.session.current_agent:
            logger.warning("No active agent to inject hint")
            return

        current_agent = self.session.current_agent

        issues = grammar_result.get("issues", [])
        if not issues:
            return

        # DYNAMIC: Filter out already-corrected error types
        new_issues = [
            i for i in issues
            if i.get("type") not in self._last_correction_types
        ]

        if not new_issues:
            logger.info("[OBSERVER] No new error types to correct")
            return

        # Inject first new issue immediately
        first_issue = new_issues[0]
        original = first_issue.get("original", "")
        correction = first_issue.get("correction", "")
        explanation = first_issue.get("explanation", "")

        # Track this error type so we don't correct again immediately
        error_type = first_issue.get("type", "unknown")
        self._last_correction_types.add(error_type)
        
        # Reset after 2 turns to allow re-correction if error persists
        self._turn_count_for_reset = self._turn_count + 2

        cue = (
            f"[TEACHER HINT — not spoken by anyone, for the AI tutor's eyes only]\n"
            f'The learner just said: "{original}"\n'
            f'A more natural phrasing: "{correction}"\n'
            f"Reason: {explanation}\n"
            f"In your NEXT spoken reply, gently weave this correction into the "
            f"conversation without breaking character. Do not read this hint aloud."
        )
        logger.info(f"[OBSERVER] Injecting correction cue (user-role): {cue[:80]}...")

        try:
            chat_ctx = current_agent.chat_ctx.copy()
            chat_ctx.add_message(role="user", content=cue)
            await current_agent.update_chat_ctx(chat_ctx)
            self._last_correction_turn = self._turn_count
            logger.info("[OBSERVER] Correction cue injected via update_chat_ctx()")
        except Exception as e:
            logger.error(f"Failed to inject correction cue: {e}")

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
            if data["type"] == "grammar":
                method_name = "grammar_feedback"
            elif data["type"] == "next-line":
                method_name = "next_line_suggestion"
            elif data["type"] == "cultural-tip":
                method_name = "cultural_tip"
            elif data["type"] == "vocab-tip":
                method_name = "vocab_tip"
            else:
                method_name = "next_line_suggestion"  # default

            await room.local_participant.perform_rpc(
                destination_identity=target_identity,
                method=method_name,
                payload=payload,
            )
            logger.info(f"[OBSERVER] RPC {data['type']} to {target_identity}")

        except Exception as e:
            logger.error(f"Failed to stream feedback via RPC: {e}")

    async def evaluate_session(self) -> dict:
        """Generate rich session evaluation summary."""
        
        SESSION_EVAL_PROMPT = """You are a language learning evaluator.
Analyze this practice session and provide a helpful summary.

Session transcript:
{transcript}

Target vocabulary to practice:
{target_vocab}

What the learner used:
{used_vocab}

Provide a JSON response with exactly these fields:
{{
  "strengths": ["what the learner did well - 2 items max"],
  "areas_to_improve": ["specific grammar/language points to work on - 2 items max"],
  "vocabulary_mastered": ["words used correctly from target vocab"],
  "vocabulary_to_practice": ["target words not yet used"],
  "suggestions": ["specific actionable suggestions to improve - 2 items max"]
}}

Be specific and actionable. Generic advice is not helpful."""

        transcript = "\n".join([
            f"{m['role']}: {m['text'][:150]}"
            for m in self.conversation_history[-20:]  # Last 20 messages
        ])
        
        target = ", ".join(self._target_vocab) if self._target_vocab else "none"
        used = ", ".join(self._used_vocab) if self._used_vocab else "none"
        
        prompt = SESSION_EVAL_PROMPT.format(
            transcript=transcript[:2000],
            target_vocab=target,
            used_vocab=used
        )
        
        chat_ctx = ChatContext()
        chat_ctx.add_message(role="user", content=prompt)
        
        response = ""
        async with self.llm.chat(chat_ctx=chat_ctx) as stream:
            async for chunk in stream:
                if chunk.delta and chunk.delta.content:
                    response += chunk.delta.content
        
        if not response:
            return self._fallback_evaluation()
        
        try:
            result = json.loads(response.strip())
            return result
        except json.JSONDecodeError:
            return self._fallback_evaluation()

    def _fallback_evaluation(self) -> dict:
        """Fallback evaluation if LLM fails."""
        unused = [w for w in self._target_vocab if w not in self._used_vocab]
        return {
            "strengths": ["Kept conversation going"],
            "areas_to_improve": [],
            "vocabulary_mastered": list(self._used_vocab),
            "vocabulary_to_practice": unused,
            "suggestions": ["Continue practicing to build fluency"]
        }


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

    # Hook into session close to trigger evaluation
    @session.on("close")
    async def on_observer_session_close(event):
        logger.info("[OBSERVER] Session closing, generating evaluation...")
        try:
            evaluation = await observer.evaluate_session()
            await observer._stream_feedback({
                "type": "session-evaluation",
                **evaluation,
            })
        except Exception as e:
            logger.error(f"Failed to generate session evaluation: {e}")

    logger.info("Observer agent started")
    return observer