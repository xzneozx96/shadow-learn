"""Utility functions for Speak with AI agent."""
import logging
from pathlib import Path
from typing import Optional

import yaml

logger = logging.getLogger("speak-with-ai.utils")


def load_prompt(filename: str) -> str:
    """Load a YAML prompt from the prompts directory.

    Mirrors Doheny's load_prompt function.

    Args:
        filename: Name of the prompt file (e.g., 'observer_prompt.yaml')

    Returns:
        The prompt string from the YAML file's 'prompt' key.
    """
    # Get the prompts directory relative to this file
    prompts_dir = Path(__file__).parent / "prompts"
    path = prompts_dir / filename

    if not path.exists():
        logger.error(f"Prompt file not found: {path}")
        return ""

    try:
        with open(path, encoding="utf-8") as f:
            data = yaml.safe_load(f)

        if not data:
            logger.error(f"Empty prompt file: {path}")
            return ""

        prompt = data.get("prompt", "")
        if not prompt:
            logger.error(f"No 'prompt' key in: {path}")
            return ""

        logger.info(f"Loaded prompt: {filename}")
        return prompt

    except yaml.YAMLError as e:
        logger.error(f"YAML parse error in {path}: {e}")
        return ""
    except Exception as e:
        logger.error(f"Error loading prompt {path}: {e}")
        return ""


def load_prompt_with_context(
    filename: str,
    context: dict[str, str],
) -> str:
    """Load a YAML prompt and format it with context variables.

    Uses str.format() to substitute placeholders in the prompt.

    Args:
        filename: Name of the prompt file
        context: Dictionary of context variables for formatting

    Returns:
        The formatted prompt string, or empty string on error.
    """
    prompt = load_prompt(filename)

    if not prompt:
        return ""

    try:
        return prompt.format(**context)
    except KeyError as e:
        logger.error(f"Missing key in prompt formatting: {e}")
        # Return unformatted prompt as fallback
        return prompt