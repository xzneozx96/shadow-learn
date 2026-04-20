"""Main PersonaAgent for Speak with AI voice practice.

This agent handles the conversation with the user, speaks in character,
and receives correction hints from the Observer agent via context injection.
"""
import logging
from typing import Optional

from livekit.agents import Agent, llm

from userdata import SpeakSessionData

logger = logging.getLogger("speak-with-ai.persona")


class PersonaAgent(Agent):
    """AI persona that speaks with user in Chinese.

    This is the main voice agent that:
    - Handles conversation in character
    - Receives correction hints from Observer via chat_ctx updates
    - Speaks naturally with in-character corrections
    """

    def __init__(
        self,
        instructions: str,
        chat_ctx: Optional[llm.ChatContext] = None,
    ) -> None:
        """Initialize the persona agent.

        Args:
            instructions: The persona prompt (system prompt)
            chat_ctx: Optional chat context (for handoffs)
        """
        super().__init__(
            instructions=instructions,
            chat_ctx=chat_ctx,
        )
        logger.info("PersonaAgent initialized")

    async def on_enter(self) -> None:
        """Called when the agent enters the conversation.

        Generates the initial greeting based on the situation.
        """
        # Access userdata via session (not self._ctx which doesn't exist in newer API)
        userdata = self.session.userdata

        logger.info(
            f"PersonaAgent entering: persona={userdata.persona_id}, "
            f"situation={userdata.situation_id}"
        )

        await self.session.generate_reply(
            instructions=(
                f"Greet the user warmly in Chinese. "
                f"The situation is: {userdata.situation_id}. "
                f"Start a natural conversation."
            )
        )