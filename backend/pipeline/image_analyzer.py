import json

from pydantic import BaseModel, Field, ValidationError

from backend.app.config import Settings

from .anthropic import generate_text


class VisualSoundObject(BaseModel):
    label: str = Field(min_length=1, max_length=60)
    location: str = Field(default="unknown", max_length=80)
    likely_sound: str = Field(min_length=1, max_length=160)
    layer: str = Field(default="midground", max_length=40)


class ImageSceneAnalysis(BaseModel):
    concrete_description: str = Field(min_length=1, max_length=1200)
    visible_objects: list[VisualSoundObject] = Field(default_factory=list, max_length=12)
    vibe: str = Field(min_length=1, max_length=300)
    grounding_sources: list[str] = Field(default_factory=list, max_length=6)


IMAGE_ANALYZER_PROMPT = """You are a sound designer analyzing a still frame for an animation or film scene.

Turn the image into a concrete audio scene description. Focus on what should be heard, not just what is visible.

Tasks:
- Identify visible sound-making objects, surfaces, weather, vehicles, crowds, animals, machines, architecture, and environmental context.
- Infer the overall vibe: genre, energy, time of day, material texture, indoor/outdoor space, and acoustic space.
- If web grounding is available, use it lightly to ground culturally/location-specific sound cues.
- Do not invent dialogue, music, or branded sounds unless clearly implied.
- Prefer production-ready audio language for animators: ambience bed, point source, foreground detail, room tone, traffic bed, foley, machinery, crowd walla.
- Include spatial hints like left/right/near/far if the image composition suggests them.

Optional user direction:
{user_context}

Respond with ONLY valid JSON:
{
  "concrete_description": "A concise but specific soundscape description...",
  "visible_objects": [
    {
      "label": "object or region",
      "location": "left foreground / far background / center frame / unknown",
      "likely_sound": "sound it should contribute",
      "layer": "foreground | midground | background"
    }
  ],
  "vibe": "overall sonic mood and acoustic character",
  "grounding_sources": ["short search/query-style cues used to ground the vibe"]
}"""


def analyze_image_scene(
    *,
    image_bytes: bytes,
    mime_type: str,
    settings: Settings,
    user_context: str | None = None,
) -> ImageSceneAnalysis:
    prompt = IMAGE_ANALYZER_PROMPT.replace(
        "{user_context}",
        user_context.strip() if user_context and user_context.strip() else "None",
    )
    response_text = generate_text(
        prompt=prompt,
        settings=settings,
        max_tokens=2048,
        image_bytes=image_bytes,
        image_mime_type=mime_type,
        web_search=True,
    )

    return _parse_image_analysis(response_text)


def _parse_image_analysis(text: str | None) -> ImageSceneAnalysis:
    if not text:
        return _fallback_image_analysis()

    try:
        return ImageSceneAnalysis.model_validate(json.loads(text))
    except (json.JSONDecodeError, ValidationError):
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                return ImageSceneAnalysis.model_validate(json.loads(text[start : end + 1]))
            except (json.JSONDecodeError, ValidationError):
                pass

    return _fallback_image_analysis()


def _fallback_image_analysis() -> ImageSceneAnalysis:
    return ImageSceneAnalysis(
        concrete_description=(
            "A visual scene translated into a natural soundscape with a soft ambient bed, "
            "mid-distance environmental texture, and one close foreground detail."
        ),
        visible_objects=[
            VisualSoundObject(
                label="Ambient environment",
                location="background",
                likely_sound="room tone or environmental ambience matching the image",
                layer="background",
            ),
            VisualSoundObject(
                label="Mid-distance activity",
                location="midground",
                likely_sound="subtle movement or activity implied by the frame",
                layer="midground",
            ),
        ],
        vibe="Natural cinematic ambience inferred from the uploaded frame.",
        grounding_sources=["visual scene ambience", "cinematic foley sound design"],
    )
