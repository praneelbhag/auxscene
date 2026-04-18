import json

from pydantic import BaseModel, Field, ValidationError

from backend.app.config import Settings

from .gemini import create_client, generation_config
from .schemas import GenerationSettings, SoundElement


class RefinedElement(BaseModel):
    id: str
    sound_prompt: str = Field(min_length=1, max_length=240)
    label: str = Field(min_length=1, max_length=40)
    x: float = Field(ge=-1.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    reverb: float = Field(ge=0.0, le=1.0)
    layer: str
    generation: GenerationSettings = Field(default_factory=GenerationSettings)
    reviewer_notes: list[str] = Field(default_factory=list)
    cache_key_hint: str | None = None


class RefinerResult(BaseModel):
    elements: list[RefinedElement] = Field(min_length=1, max_length=6)


PROMPT_REFINER_PROMPT = """You are a senior sound designer reviewing sound-effect prompts before ElevenLabs generation.

Improve each element so it is more likely to generate the exact sound the user wants.

Rules:
- Keep each sound_prompt concrete and under 28 words.
- Prefer realistic field-recording language unless the user asks for stylized sound.
- Keep natural environments gentle and balanced: avoid words like loud, sharp, intense, cinematic, massive, or dramatic unless requested.
- For background beds, include quiet/subtle/distant language so they support the scene instead of dominating it.
- Add useful negative constraints like "no speech" or "no music" when appropriate.
- For ambience/background beds, set loop=true and duration_seconds 8-20.
- For point/foreground one-shots, set loop=false and duration_seconds 1-6.
- Raise prompt_influence when precision matters, usually 0.55-0.85.
- Preserve ids and spatial coordinates unless they are clearly wrong.
- Provide 1-3 concise reviewer_notes explaining important prompt changes.
- cache_key_hint should be a lowercase canonical sound identity, e.g. "steady rain wet asphalt no speech".

Respond with ONLY valid JSON:
{
  "elements": [
    {
      "id": "elem_1",
      "sound_prompt": "...",
      "label": "...",
      "x": 0.0,
      "y": 0.8,
      "reverb": 0.3,
      "layer": "background",
      "generation": {"loop": true, "duration_seconds": 12, "prompt_influence": 0.65},
      "reviewer_notes": ["..."],
      "cache_key_hint": "..."
    }
  ]
}"""


def refine_sound_prompts(
    *,
    original_prompt: str,
    concrete_description: str,
    elements: list[SoundElement],
    settings: Settings,
) -> list[SoundElement]:
    payload = {
        "original_prompt": original_prompt,
        "concrete_description": concrete_description,
        "elements": [element.model_dump() for element in elements],
    }
    try:
        client = create_client(settings)
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=f"{PROMPT_REFINER_PROMPT}\n\nInput JSON:\n{json.dumps(payload)}",
            config=generation_config(settings, json_mode=True),
        )
    except Exception:
        return _fallback_refine(elements)

    result = _parse_refiner_response(response.text)
    if not result:
        return _fallback_refine(elements)

    by_id = {element.id: element for element in elements}
    refined: list[SoundElement] = []
    for refined_element in result.elements:
        original = by_id.get(refined_element.id)
        if not original:
            continue
        data = original.model_dump()
        data.update(refined_element.model_dump())
        refined.append(SoundElement.model_validate(data))

    return refined or _fallback_refine(elements)


def _parse_refiner_response(text: str | None) -> RefinerResult | None:
    if not text:
        return None

    try:
        return RefinerResult.model_validate(json.loads(text))
    except (json.JSONDecodeError, ValidationError):
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                return RefinerResult.model_validate(json.loads(text[start : end + 1]))
            except (json.JSONDecodeError, ValidationError):
                return None

    return None


def _fallback_refine(elements: list[SoundElement]) -> list[SoundElement]:
    refined: list[SoundElement] = []
    for element in elements:
        loop = element.layer == "background"
        duration = 12.0 if loop else 4.0 if element.layer == "midground" else 2.5
        influence = 0.65 if loop else 0.75
        data = element.model_dump()
        data["sound_prompt"] = _with_default_constraints(element.sound_prompt, loop=loop)
        data["generation"] = GenerationSettings(
            loop=loop,
            duration_seconds=duration,
            prompt_influence=influence,
        )
        data["reviewer_notes"] = ["Added generation settings and anti-music/speech constraints."]
        data["cache_key_hint"] = data["sound_prompt"].lower()
        refined.append(SoundElement.model_validate(data))
    return refined


def _with_default_constraints(prompt: str, *, loop: bool) -> str:
    suffix = "seamless loop, no music, no speech" if loop else "no music, no speech"
    if "no music" in prompt.lower():
        return prompt
    return f"{prompt}, {suffix}"
