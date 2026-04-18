"""Persona and situation definitions for AI conversation sessions."""

from typing import Any

# Persona definitions: id -> persona data
PERSONAS: dict[str, dict[str, Any]] = {
    "friendly_student": {
        "id": "friendly_student",
        "name": "Friendly Student",
        "description": "A friendly language learner for casual conversation practice",
        "language": "zh-CN",
    },
    "business_professional": {
        "id": "business_professional",
        "name": "Business Professional",
        "description": "A business person for professional dialogue practice",
        "language": "zh-CN",
    },
    "travel_guide": {
        "id": "travel_guide",
        "name": "Travel Guide",
        "description": "A helpful local guide for travel-related conversations",
        "language": "zh-CN",
    },
    "restaurant_server": {
        "id": "restaurant_server",
        "name": "Restaurant Server",
        "description": "A waiter/waitress for restaurant ordering scenarios",
        "language": "zh-CN",
    },
}

# Situation definitions: id -> situation data
SITUATIONS: dict[str, dict[str, Any]] = {
    "casual_chat": {
        "id": "casual_chat",
        "name": "Casual Chat",
        "description": "Free-form casual conversation",
        "context": "Informal setting for everyday conversation",
    },
    "ordering_food": {
        "id": "ordering_food",
        "name": "Ordering Food",
        "description": "At a restaurant, ordering food and drinks",
        "context": "Restaurant setting",
    },
    "asking_directions": {
        "id": "asking_directions",
        "name": "Asking Directions",
        "description": "Asking for and following directions",
        "context": "Street or public place",
    },
    "shopping": {
        "id": "shopping",
        "name": "Shopping",
        "description": "Shopping for items, negotiating prices",
        "context": "Market or store setting",
    },
    "meeting": {
        "id": "meeting",
        "name": "Business Meeting",
        "description": "Formal business meeting conversation",
        "context": "Office or conference room",
    },
}


def get_persona(persona_id: str) -> dict[str, Any] | None:
    """Get a persona by ID."""
    return PERSONAS.get(persona_id)


def get_situation(situation_id: str) -> dict[str, Any] | None:
    """Get a situation by ID."""
    return SITUATIONS.get(situation_id)


def validate_ids(persona_id: str, situation_id: str) -> tuple[bool, str]:
    """Validate that persona_id and situation_id exist.
    
    Returns:
        tuple: (is_valid, error_message)
    """
    if persona_id not in PERSONAS:
        return False, f"Invalid persona_id: {persona_id}"
    if situation_id not in SITUATIONS:
        return False, f"Invalid situation_id: {situation_id}"
    return True, ""
