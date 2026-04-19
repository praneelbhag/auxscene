import json

from pydantic import BaseModel, Field, ValidationError

from backend.app.config import Settings

from .gemini import create_client, generation_config
from .schemas import GenerationSettings, MixSettings, SoundElement


class RefinedElement(BaseModel):
    id: str
    sound_prompt: str = Field(min_length=1, max_length=240)
    label: str = Field(min_length=1, max_length=40)
    x: float = Field(ge=-1.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    reverb: float = Field(ge=0.0, le=1.0)
    layer: str
    generation: GenerationSettings = Field(default_factory=GenerationSettings)
    mix: MixSettings = Field(default_factory=MixSettings)
    reviewer_notes: list[str] = Field(default_factory=list)
    cache_key_hint: str | None = None


class RefinerResult(BaseModel):
    elements: list[RefinedElement] = Field(min_length=1, max_length=6)


ELEVENLABS_PROMPTING_GUIDE = """ElevenLabs Sound Effects prompting guide:
- Sound effects are generated from clear text descriptions plus optional duration, looping, and prompt influence.
- Duration range is 0.1 to 30 seconds. When duration is specified, cost scales by seconds.
- Looping is best for atmospheric sounds, ambient textures, and background elements that repeat without a perceptible start/end point.
- Prompt influence controls literalness: high means stricter prompt following, low allows more creative variations.
- Simple effects should be concise and concrete, e.g. "glass shattering on concrete", "heavy wooden door creaking open", "thunder rumbling in the distance".
- Complex sequences should describe event order, e.g. "footsteps on gravel, then a metallic door opens".
- Useful terms: ambience, one-shot, loop, stem, impact, whoosh, drone, glitch.
- Avoid musical terms unless the user explicitly asks for music. Terms like drum loop, synth pad, braam, bass line, melody, BPM, and key can pull the model toward music.
- For SoundScene, prefer isolated stems that mix well together: natural field recording, sparse, gentle, distant, soft, muffled, no speech, no music.
"""


PROMPT_REFINER_PROMPT = """You are a senior sound designer reviewing sound-effect prompts before ElevenLabs generation.

Improve each element so it is more likely to generate the exact sound the user wants.

Use this provider-specific guide:
{elevenlabs_prompting_guide}

Rules:
- Keep each sound_prompt concrete, concise, and under 28 words.
- Write each prompt like an ElevenLabs sound-effect prompt, not a prose scene description.
- Prefer one isolated stem per element. Do not ask one element to produce multiple unrelated sounds.
- Prefer realistic field-recording language unless the user asks for stylized sound.
- Keep natural environments gentle and balanced: avoid words like loud, sharp, intense, cinematic, massive, or dramatic unless requested.
- For background beds, include quiet/subtle/distant language so they support the scene instead of dominating it.
- Add useful negative constraints like "no speech" or "no music" when appropriate.
- For ambience/background beds, set loop=true and duration_seconds 8-20.
- For point/foreground one-shots, set loop=false and duration_seconds 1-6.
- Raise prompt_influence when precision matters, usually 0.55-0.85.
- Add mix metadata as an audio script: start_seconds, gain_db, density, role, high_cut_hz, low_cut_hz, duck_background, fade_ms.
- Keep background beds around -18 to -14 gain_db, midground around -13 to -8, foreground around -8 to -4.
- Use high_cut_hz to soften distant/background sounds, usually 7000-10000 for background and 10000-14000 for midground.
- Use fade_ms between 20 and 1000. Longer fades are fine for ambience; short fades are better for one-shots.
- Use sparse/occasional density and delayed start_seconds for point sources so the scene breathes.
- Foreground one-shots should set duck_background=true.
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
      "mix": {
        "start_seconds": 0,
        "gain_db": -16,
        "density": "continuous",
        "role": "bed",
        "high_cut_hz": 8500,
        "low_cut_hz": 80,
        "duck_background": false,
        "fade_ms": 80
      },
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
            contents=(
                PROMPT_REFINER_PROMPT.replace(
                    "{elevenlabs_prompting_guide}",
                    ELEVENLABS_PROMPTING_GUIDE,
                )
                + f"\n\nInput JSON:\n{json.dumps(payload)}"
            ),
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
        data["mix"] = _default_mix(element)
        data["reviewer_notes"] = ["Added generation settings and anti-music/speech constraints."]
        data["cache_key_hint"] = data["sound_prompt"].lower()
        refined.append(SoundElement.model_validate(data))
    return refined


def _with_default_constraints(prompt: str, *, loop: bool) -> str:
    suffix = "seamless loop, no music, no speech" if loop else "no music, no speech"
    if "no music" in prompt.lower():
        return prompt
    return f"{prompt}, {suffix}"


def _default_mix(element: SoundElement) -> MixSettings:
    if element.layer == "background":
        return MixSettings(
            start_seconds=0.0,
            gain_db=-16.0,
            density="continuous",
            role="bed",
            high_cut_hz=8500.0,
            low_cut_hz=80.0,
            duck_background=False,
            fade_ms=90.0,
        )
    if element.layer == "foreground":
        return MixSettings(
            start_seconds=2.0,
            gain_db=-7.0,
            density="occasional",
            role="focus",
            high_cut_hz=14500.0,
            low_cut_hz=60.0,
            duck_background=True,
            fade_ms=30.0,
        )
    return MixSettings(
        start_seconds=0.8,
        gain_db=-11.0,
        density="sparse",
        role="texture",
        high_cut_hz=11500.0,
        low_cut_hz=70.0,
        duck_background=False,
        fade_ms=60.0,
    )
