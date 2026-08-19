import json

from pydantic import BaseModel, Field, ValidationError

from backend.app.config import Settings

from .anthropic import generate_text


class GroundingResult(BaseModel):
    grounding_sources: list[str] = Field(min_length=2, max_length=3)
    concrete_description: str = Field(min_length=1)


GROUNDING_PROMPT = """You ground abstract concepts into concrete soundscape descriptions.

For the user's abstract concept:
1. Use web search grounding when available.
2. Choose 2-3 short search-query-style source labels, such as "sounds associated with peace".
3. Extract concrete sounds people associate with the concept.
4. Synthesize one vivid, physical scene description suitable for audio generation.

Respond with ONLY valid JSON:
{
  "grounding_sources": ["...", "..."],
  "concrete_description": "..."
}"""


def ground_abstract_prompt(prompt: str, settings: Settings) -> GroundingResult:
    response_text = generate_text(
        prompt=f"{GROUNDING_PROMPT}\n\nAbstract concept: {prompt}",
        settings=settings,
        max_tokens=1024,
        web_search=True,
    )

    return _parse_grounding_response(response_text, prompt)


def _parse_grounding_response(text: str | None, prompt: str) -> GroundingResult:
    if not text:
        return _fallback_grounding(prompt)

    try:
        return GroundingResult.model_validate(json.loads(text))
    except (json.JSONDecodeError, ValidationError):
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                return GroundingResult.model_validate(json.loads(text[start : end + 1]))
            except (json.JSONDecodeError, ValidationError):
                pass

    return _fallback_grounding(prompt)


def _fallback_grounding(prompt: str) -> GroundingResult:
    return GroundingResult(
        grounding_sources=[
            f"sounds associated with {prompt}",
            f"ambient soundscape {prompt}",
        ],
        concrete_description=(
            f"A grounded soundscape inspired by {prompt}, using gentle ambience, "
            "subtle natural textures, and a few distinct point-source sounds."
        ),
    )
