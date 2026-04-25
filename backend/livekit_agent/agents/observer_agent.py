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

_TARGET_LANGUAGE_NAMES: dict[str, str] = {
    "zh-CN": "Mandarin Chinese",
    "en": "English",
    "ja": "Japanese",
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
        room=None,
    ):
        """Initialize the observer agent.

        Args:
            session: AgentSession to monitor
            llm: LLM instance for evaluation (e.g., GPT-4o-mini)

        Note: Pronunciation assessment removed - not feasible with OpenAI Realtime.
        """
        self.session = session
        self.llm = llm
        self._room = room

        # Conversation tracking
        self.conversation_history: list[dict] = []

        # Evaluation settings
        self._evaluating = False

        self._turn_count: int = 0

        # Vocabulary tracking
        self._target_vocab: list[str] = []
        self._used_vocab: set[str] = set()

        self._setup_listeners()

        logger.info(
            f"ObserverAgent initialized: LLM={getattr(self.llm, 'model', 'custom')}, "
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

        asyncio.create_task(self._track_vocab_usage(transcript))
        asyncio.create_task(self._evaluate_user_turn(transcript))

        if self._turn_count % 3 == 0:
            asyncio.create_task(self._trigger_cultural_check(transcript))

    def _handle_ai_turn(self, transcript: str) -> None:
        """Handle AI turn - trigger next line suggestion."""
        # Suggest next line + vocab after AI speaks (to help user respond)
        asyncio.create_task(self._suggest_next_line())

    async def _track_vocab_usage(self, transcript: str) -> None:
        """Check user transcript for target vocab usage (async to allow RPC)."""
        if not self._target_vocab:
            return
            
        for word in self._target_vocab:
            if word.lower() in transcript.lower():
                if word not in self._used_vocab:
                    self._used_vocab.add(word)
                    logger.info(f"[OBSERVER] Mastered vocab: {word}")
                    
                    # Notify frontend immediately
                    await self._stream_feedback({
                        "type": "vocab-mastered",
                        "word": word
                    })

    async def _evaluate_user_turn(self, user_transcript: str) -> None:
        """Evaluate grammar and stream results to frontend via RPC."""
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
                await self._stream_feedback({
                    "type": "grammar",
                    "transcript": user_transcript,
                    "issues": grammar_result.get("issues", []),
                })

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
            "language_name": _TARGET_LANGUAGE_NAMES.get(language, language),
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
            
            # Find unused target vocab for the suggestion
            unused = [w for w in self._target_vocab if w not in self._used_vocab]
            target_vocab_context = ", ".join(unused[:5]) if unused else ""

            if config:
                situation_description = config.scene_context
                user_goal = config.user_goal
                interface_language = config.interface_language or "vi"
            else:
                situation_description = userdata.situation_id or "casual_chat"
                user_goal = ""
                interface_language = "vi"
            persona_id = userdata.persona_id or "friendly_buddy"
            target_language = getattr(userdata, "target_language", None) or "zh-CN"
            level = getattr(userdata, "proficiency_level", "intermediate")
        except Exception:
            situation_description = "casual_chat"
            user_goal = ""
            target_vocab_context = ""
            persona_id = "friendly_buddy"
            target_language = "zh-CN"
            level = "intermediate"
            interface_language = "vi"

        context = {
            "conversation_text": conversation_text,
            "situation_description": situation_description,
            "user_goal": user_goal,
            "target_vocab": target_vocab_context,
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

            # Stream merged suggestion (including vocab_tip if present)
            await self._stream_feedback({
                "type": "next-line",
                "suggestion": result.get("suggestion", ""),
                "romanization": result.get("romanization", ""),
                "translation": result.get("translation", ""),
                "vocab_tip": result.get("vocab_tip")
            })

        except json.JSONDecodeError:
            # Fallback parsing
            start = response_text.find('{')
            end = response_text.rfind('}') + 1
            if start >= 0 and end > start:
                try:
                    result = json.loads(response_text[start:end])
                    # Stream merged suggestion
                    await self._stream_feedback({
                        "type": "next-line",
                        "suggestion": result.get("suggestion", ""),
                        "romanization": result.get("romanization", ""),
                        "translation": result.get("translation", ""),
                        "vocab_tip": result.get("vocab_tip")
                    })
                except json.JSONDecodeError:
                    pass

    async def _detect_cultural_moment(self, transcript: str) -> Optional[dict]:
        """LLM-powered cultural moment detection."""

        conv = "\n".join([
            f"{m['role']}: {m['text']}"
            for m in self.conversation_history
        ])
        
        # Get interface language and target language from session userdata
        try:
            userdata = self.session.userdata
            config = getattr(userdata, "situation_config", None)
            if config:
                interface_language = getattr(config, "interface_language", "vi")
            else:
                interface_language = "vi"
            target_language = getattr(userdata, "target_language", None) or "zh-CN"
        except Exception:
            interface_language = "vi"
            target_language = "zh-CN"

        interface_lang_name = _LOCALE_TO_LANGUAGE_NAME.get(interface_language, interface_language)
        target_language_name = _TARGET_LANGUAGE_NAMES.get(target_language, target_language)

        prompt_template = load_prompt("cultural_prompt.yaml")
        if not prompt_template:
            logger.warning("Cultural prompt not found, skipping detection")
            return None

        prompt = prompt_template.format(
            conversation=conv,
            interface_language=interface_lang_name,
            target_language=target_language,
            target_language_name=target_language_name,
        )
        
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
            start = response.find('{')
            end = response.rfind('}') + 1
            if start >= 0 and end > start:
                try:
                    result = json.loads(response[start:end])
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

    async def _stream_feedback(self, data: dict) -> None:
        """Stream feedback data to frontend via RPC.

        Args:
            data: Feedback data to send (grammar issues or next-line suggestion)
        """
        # Use direct room reference if provided; fall back to session.room_io.room
        try:
            room = self._room or self.session.room_io.room
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
            elif data["type"] == "vocab-mastered":
                method_name = "vocab_mastered"
            else:
                logger.warning(f"[OBSERVER] Unknown feedback type: {data.get('type')} — dropping")
                return

            await room.local_participant.perform_rpc(
                destination_identity=target_identity,
                method=method_name,
                payload=payload,
            )
            logger.info(f"[OBSERVER] RPC {data['type']} to {target_identity}")

        except Exception as e:
            logger.error(f"Failed to stream feedback via RPC: {e}")

    async def evaluate_session(self) -> dict:
        """Generate rich session evaluation summary. Never raises — always returns a valid dict."""
        try:
            return await self._evaluate_session_inner()
        except Exception as e:
            logger.error(f"[OBSERVER] evaluate_session failed: {e}")
            return self._fallback_evaluation()

    async def _evaluate_session_inner(self) -> dict:
        transcript = "\n".join([
            f"{m['role']}: {m['text']}"
            for m in self.conversation_history
        ])

        target = ", ".join(self._target_vocab) if self._target_vocab else "none"
        used = ", ".join(self._used_vocab) if self._used_vocab else "none"

        try:
            userdata = self.session.userdata
            config = getattr(userdata, "situation_config", None)
            if config:
                interface_language = getattr(config, "interface_language", "vi")
            else:
                interface_language = "vi"
            target_language = getattr(userdata, "target_language", None) or "zh-CN"
        except Exception:
            interface_language = "vi"
            target_language = "zh-CN"

        interface_lang_name = _LOCALE_TO_LANGUAGE_NAME.get(interface_language, interface_language)
        target_language_name = _TARGET_LANGUAGE_NAMES.get(target_language, target_language)

        prompt_template = load_prompt("session_evaluation_prompt.yaml")
        if not prompt_template:
            return self._fallback_evaluation()

        prompt = prompt_template.format(
            transcript=transcript,
            target_vocab=target,
            used_vocab=used,
            interface_language=interface_lang_name,
            target_language_name=target_language_name,
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
            "type": "session-evaluation",
            "strengths": ["Kept conversation going"],
            "areas_to_improve": [],
            "vocabulary_mastered": list(self._used_vocab),
            "vocabulary_to_practice": unused,
            "suggestions": ["Continue practicing to build fluency"]
        }


async def start_observer(
    session,
    llm,
    room=None,
) -> ObserverAgent:
    """Start the observer agent for a session.

    Args:
        session: AgentSession to monitor
        llm: LLM instance for evaluation
        room: Optional direct room reference for RPC delivery

    Returns:
        ObserverAgent instance

    Note: Pronunciation assessment removed - not feasible with OpenAI Realtime.
    """
    observer = ObserverAgent(
        session=session,
        llm=llm,
        room=room,
    )
    observer.initialize_from_userdata()

    logger.info("Observer agent started")
    return observer