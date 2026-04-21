"""Session data for Speak with AI voice practice workflow."""
import logging
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger("speak-with-ai.userdata")


@dataclass
class SpeakSessionData:
    """Session data for voice practice workflow.

    This mirrors Doheny's SurfBookingData pattern for session state management.
    """
    # Persona & Situation Configuration
    persona_id: Optional[str] = None
    situation_id: Optional[str] = None
    system_prompt: Optional[str] = None
    voice_id: Optional[str] = None

    # NEW — language + level + resolved situation config
    target_language: Optional[str] = None
    proficiency_level: Optional[str] = None
    situation_config: Optional[Any] = None

    # User credentials (may be passed for BYO keys)
    openai_api_key: Optional[str] = None
    google_api_key: Optional[str] = None

    # Conversation tracking
    turn_count: int = 0
    conversation_history: list = field(default_factory=list)
    last_user_turn: str = ""
    last_ai_turn: str = ""

    # Feedback data for IndexedDB persistence
    grammar_issues: list = field(default_factory=list)
    suggestions: list = field(default_factory=list)

    # Evaluation state
    hints_sent: list = field(default_factory=list)
    last_eval_turn: int = 0
    eval_threshold: int = 1  # Evaluate every turn (configurable)

    def add_user_turn(self, transcript: str):
        """Add a user turn to conversation history."""
        self.conversation_history.append({
            "role": "user",
            "content": transcript,
        })
        self.last_user_turn = transcript
        self.turn_count += 1

    def add_ai_turn(self, transcript: str):
        """Add an AI turn to conversation history."""
        self.conversation_history.append({
            "role": "assistant",
            "content": transcript,
        })
        self.last_ai_turn = transcript

    def summarize(self) -> str:
        """Return summary of session state."""
        parts = []
        if self.persona_id:
            parts.append(f"Persona: {self.persona_id}")
        if self.situation_id:
            parts.append(f"Situation: {self.situation_id}")
        if self.target_language:
            parts.append(f"Language: {self.target_language}")
        if self.proficiency_level:
            parts.append(f"Level: {self.proficiency_level}")
        if self.situation_config:
            parts.append(f"Config: {getattr(self.situation_config, 'id', 'set')}")
        parts.append(f"Turns: {self.turn_count}")
        return " | ".join(parts) if parts else "No session info yet"

    def format_conversation_text(self, last_n: int = 5) -> str:
        """Format recent conversation for LLM prompts."""
        history = self.conversation_history[-last_n:] if last_n else self.conversation_history
        return "\n".join([
            f"{msg['role']}: {msg['content']}"
            for msg in history
        ])