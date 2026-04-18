"""Persona and situation definitions for AI conversation sessions."""

from typing import Any

# Persona definitions: id -> persona data (matching frontend)
PERSONAS: dict[str, dict[str, Any]] = {
    "friendly_buddy": {
        "id": "friendly_buddy",
        "name": "Friendly Buddy",
        "description": "A friendly language partner for casual practice",
        "system_prompt": "You are a friendly Chinese language partner. Help the user practice casual conversations in Mandarin Chinese. Be encouraging, patient, and gently correct mistakes.",
    },
    "anime_crushing": {
        "id": "anime_crushing",
        "name": "Anime Crush",
        "description": "Flirty and fun - but don't get distracted!",
        "system_prompt": "You are a charming anime-style character having playful banter. Use some Chinese slang and be flirty but wholesome. Make the conversation fun!",
    },
    "angry_mom": {
        "id": "angry_mom",
        "name": "Angry Mom",
        "description": "Why haven't you studied?! Let me help you!",
        "system_prompt": "You are a loving but exasperated Chinese mom. You want your child to study hard! Be strict but caring, and correct their mistakes with concern.",
    },
    "taxi_driver": {
        "id": "taxi_driver",
        "name": "Beijing Taxi Driver",
        "description": "Knows the city like the back of his hand",
        "system_prompt": "You are a Beijing taxi driver who knows every street. Chat with passengers in casual Beijing dialect. Be friendly and helpful.",
    },
    "kdrama_oppa": {
        "id": "kdrama_oppa",
        "name": "K-drama Oppa",
        "description": "Charming and always has a joke ready",
        "system_prompt": "You are a charming K-drama style oppa. Use warm, flirty dialogue. Make the user laugh with cheesy but cute lines.",
    },
}

# Situation definitions: id -> situation data (matching frontend)
SITUATIONS: dict[str, dict[str, Any]] = {
    "casual_chat": {
        "id": "casual_chat",
        "name": "Casual Chat",
        "description": "Free-form casual conversation",
    },
    "ordering_food": {
        "id": "ordering_food",
        "name": "Ordering Food",
        "description": "At a restaurant, ordering food and drinks",
    },
    "asking_directions": {
        "id": "asking_directions",
        "name": "Asking Directions",
        "description": "Asking for and following directions",
    },
    "shopping": {
        "id": "shopping",
        "name": "Shopping",
        "description": "Shopping for items, negotiating prices",
    },
    "job_interview": {
        "id": "job_interview",
        "name": "Job Interview",
        "description": "Formal job interview conversation",
    },
    "meeting_parents": {
        "id": "meeting_parents",
        "name": "Meeting Parents",
        "description": "Meeting the parents for the first time",
    },
    "hospital": {
        "id": "hospital",
        "name": "Hospital Visit",
        "description": "At the hospital, describing symptoms",
    },
    "karaoke": {
        "id": "karaoke",
        "name": "Karaoke Night",
        "description": "Singing at karaoke with friends",
    },
    "market_haggling": {
        "id": "market_haggling",
        "name": "Market Haggling",
        "description": "Negotiating prices at the market",
    },
    "dating_app": {
        "id": "dating_app",
        "name": "Dating App",
        "description": "Chatting on a dating app",
    },
}


def get_persona(persona_id: str) -> dict[str, Any] | None:
    """Get a persona by ID."""
    return PERSONAS.get(persona_id)


def get_situation(situation_id: str) -> dict[str, Any] | None:
    """Get a situation by ID."""
    return SITUATIONS.get(situation_id)


def validate_ids(persona_id: str, situation_id: str) -> tuple[bool, str]:
    """Validate that persona_id and situation_id exist."""
    if persona_id not in PERSONAS:
        return False, f"Invalid persona_id: {persona_id}"
    if situation_id not in SITUATIONS:
        return False, f"Invalid situation_id: {situation_id}"
    return True, ""