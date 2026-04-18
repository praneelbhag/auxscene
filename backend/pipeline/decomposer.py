import json

from pydantic import BaseModel, Field, ValidationError

from backend.app.config import Settings

from .gemini import create_client, generation_config
from .schemas import SoundElement


class DecompositionResult(BaseModel):
    concrete_description: str = Field(min_length=1)
    elements: list[SoundElement] = Field(min_length=3, max_length=6)


DECOMPOSER_PROMPT = """You are a spatial audio designer. Decompose this scene into 3-6 individual sound elements.

Each element needs:
- sound_prompt: A specific, descriptive prompt for a sound effects generation AI. Be concrete, under 20 words.
- label: Short name for UI display, 2-3 words max.
- x: horizontal position from -1 (left) to 1 (right).
- y: distance from listener, 0 (close) to 1 (far).
- reverb: 0 (dry/close) to 1 (wet/spacious).
- layer: foreground (<0.3 y), midground (0.3-0.6 y), or background (>0.6 y).

Rules:
- Spread sounds across the stereo field.
- Background ambience should be centered and distant.
- Point sources should have distinct positions.
- Use ids exactly like elem_1, elem_2, elem_3.
- Return 3-6 elements.

Respond with ONLY valid JSON matching this structure:
{
  "concrete_description": "...",
  "elements": [
    {
      "id": "elem_1",
      "sound_prompt": "...",
      "label": "...",
      "x": 0.0,
      "y": 0.7,
      "reverb": 0.3,
      "layer": "background"
    }
  ]
}"""


def decompose_scene(concrete_description: str, settings: Settings) -> DecompositionResult:
    client = create_client(settings)
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=f"{DECOMPOSER_PROMPT}\n\nScene: {concrete_description}",
        config=generation_config(settings, json_mode=True),
    )

    result = _parse_decomposition_response(response.text, concrete_description)
    return _normalize_decomposition(result)


def _parse_decomposition_response(
    text: str | None,
    concrete_description: str,
) -> DecompositionResult:
    if not text:
        return _fallback_decomposition(concrete_description)

    try:
        return DecompositionResult.model_validate(json.loads(text))
    except (json.JSONDecodeError, ValidationError):
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                return DecompositionResult.model_validate(json.loads(text[start : end + 1]))
            except (json.JSONDecodeError, ValidationError):
                pass

    return _fallback_decomposition(concrete_description)


def _normalize_decomposition(result: DecompositionResult) -> DecompositionResult:
    normalized = []
    for index, element in enumerate(result.elements[:6], start=1):
        data = element.model_dump()
        data["id"] = f"elem_{index}"
        data["x"] = round(float(data["x"]), 3)
        data["y"] = round(float(data["y"]), 3)
        data["reverb"] = round(float(data["reverb"]), 3)
        normalized.append(SoundElement.model_validate(data))

    return DecompositionResult(
        concrete_description=result.concrete_description,
        elements=normalized,
    )


def _fallback_decomposition(concrete_description: str) -> DecompositionResult:
    return DecompositionResult(
        concrete_description=concrete_description,
        elements=[
            SoundElement(
                id="elem_1",
                sound_prompt="soft background ambience matching the scene, wide and distant",
                label="Ambience",
                x=0.0,
                y=0.85,
                reverb=0.35,
                layer="background",
            ),
            SoundElement(
                id="elem_2",
                sound_prompt="distinct mid-distance environmental sound, clear and natural",
                label="Mid Sound",
                x=-0.55,
                y=0.5,
                reverb=0.3,
                layer="midground",
            ),
            SoundElement(
                id="elem_3",
                sound_prompt="nearby foreground detail sound, crisp and focused",
                label="Close Detail",
                x=0.55,
                y=0.2,
                reverb=0.12,
                layer="foreground",
            ),
        ],
    )
