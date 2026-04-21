"""Generate backend/app/speak/situations_data.json from seeds using an LLM.

Usage:
    python backend/scripts/seed_situations.py [--languages zh-CN ja en] [--dry-run]

Requires OPENROUTER_API_KEY env var (or use --dry-run).
"""
import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path

import httpx

LOGGER = logging.getLogger("seed-situations")

ROOT = Path(__file__).parent.parent
SEEDS_PATH = ROOT / "scripts" / "seeds" / "situations_seeds.json"
OUTPUT_PATH = ROOT / "app" / "speak" / "situations_data.json"

ALL_LANGUAGES = ["zh-CN", "zh-TW", "en", "ja", "ko", "vi"]
LEVELS = ["beginner", "intermediate", "advanced"]


def _variant_prompt(seed: dict, language: str, level: str) -> str:
    return f"""Generate a language-learning roleplay scene variant.

Base scene (neutral):
  AI role: {seed['ai_role_neutral']}
  User goal: {seed['user_goal_neutral']}
  Dynamics: {seed['scene_dynamics']}

Target language: {language}
Learner level: {level}

Produce a culturally-accurate variant for this language + level.
Japanese uses keigo at beginner/intermediate, casual at advanced-friend scenes.
Chinese mainland is direct; Taiwan slightly softer.
Match the level in vocabulary complexity and sentence length.

Return STRICT JSON, no markdown:
{{
  "ai_role": "<specific role in the target culture, in English>",
  "scene_context": "<2-3 sentences describing the scene, in English for prompt use>",
  "opening_line": "<AI first line in {language}, level-appropriate>",
  "user_goal": "<user's goal, in English, 1 sentence>",
  "target_vocab": [<5-8 key vocab items in {language}>]
}}
"""


async def _call_llm(prompt: str, api_key: str) -> dict:
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": "openai/gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
                "temperature": 0.4,
                "max_tokens": 800,
            },
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        return json.loads(content)


async def generate_variant(seed: dict, language: str, level: str, api_key: str) -> dict:
    prompt = _variant_prompt(seed, language, level)
    LOGGER.info(f"  Generating {seed.get('id', '?')} / {language} / {level}...")
    return await _call_llm(prompt, api_key)


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--languages", nargs="+", default=ALL_LANGUAGES)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(message)s")

    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key and not args.dry_run:
        LOGGER.error("OPENROUTER_API_KEY env var is required (or pass --dry-run)")
        return 1

    with SEEDS_PATH.open("r", encoding="utf-8") as f:
        seeds = json.load(f)

    output: dict = {"meta": {"version": 1}, "situations": {}}
    if OUTPUT_PATH.exists():
        with OUTPUT_PATH.open("r", encoding="utf-8") as f:
            output = json.load(f)

    for seed_entry in seeds["situations"]:
        sid = seed_entry["id"]
        LOGGER.info(f"\nSituation: {sid}")
        output["situations"].setdefault(sid, {
            "display": seed_entry["display"],
            "seed": seed_entry["seed"],
            "variants": {},
        })

        for language in args.languages:
            output["situations"][sid]["variants"].setdefault(language, {})
            for level in LEVELS:
                if level in output["situations"][sid]["variants"][language]:
                    LOGGER.info(f"  Skip existing: {language}/{level}")
                    continue
                if args.dry_run:
                    output["situations"][sid]["variants"][language][level] = {
                        "ai_role": "DRY_RUN",
                        "scene_context": "DRY_RUN",
                        "opening_line": "DRY_RUN",
                        "user_goal": "DRY_RUN",
                        "target_vocab": ["DRY_RUN"],
                    }
                    continue
                variant = await generate_variant(
                    seed_entry["seed"], language, level, api_key
                )
                output["situations"][sid]["variants"][language][level] = variant

    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    LOGGER.info(f"\nWrote {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
