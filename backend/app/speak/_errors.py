"""Shared exception types for the speak module.

Lives in its own file so `generation.py` and `offshore_client.py` can both
import without creating a cycle.
"""


class GenerationError(Exception):
    """Raised when situation generation or validation fails."""
