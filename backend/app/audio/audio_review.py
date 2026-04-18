import asyncio
import json
from pathlib import Path

from pydantic import ValidationError

from backend.app.config import Settings
from backend.pipeline.gemini import create_client

from .schemas import AudioReview, SceneElement


REVIEW_PROMPT = """You are reviewing an AI-generated sound effect for a spatial audio scene.

Compare the audio to the intended prompt and listening comfort, then return concise JSON:
{
  "score": 0.0,
  "description": "what the audio actually sounds like",
  "issues": ["specific mismatch, harshness, excessive loudness, or dominance risk, if any"],
  "suggested_prompt": "better ElevenLabs prompt if score is below 0.8"
}

Score:
- 1.0 means it matches the prompt extremely well.
- 0.7 means usable but needs refinement.
- 0.4 means wrong sound family or major missing detail.

Penalize sounds that are too sharp, too loud, too dense, musical, speech-like, or likely to dominate a natural environment.
When suggesting a prompt, prefer words like gentle, distant, soft, low-intensity, natural field recording, no music, no speech.
"""


async def review_audio_file(
    *,
    audio_path: Path,
    element: SceneElement,
    settings: Settings,
) -> AudioReview | None:
    if not settings.audio_review_enabled:
        return None

    return await asyncio.to_thread(_review_audio_file_sync, audio_path, element, settings)


def _review_audio_file_sync(
    audio_path: Path,
    element: SceneElement,
    settings: Settings,
) -> AudioReview:
    try:
        client = create_client(settings)
        uploaded = client.files.upload(file=str(audio_path))
        response = client.models.generate_content(
            model=settings.audio_review_model,
            contents=[
                f"{REVIEW_PROMPT}\nIntended prompt: {element.sound_prompt}\nLabel: {element.label}",
                uploaded,
            ],
        )
        return _parse_review(response.text)
    except Exception as exc:
        return AudioReview(
            score=None,
            description=None,
            issues=[f"Audio review failed: {exc}"],
            suggested_prompt=None,
        )


def _parse_review(text: str | None) -> AudioReview:
    if not text:
        return AudioReview(issues=["Audio reviewer returned an empty response."])

    try:
        return AudioReview.model_validate(json.loads(text))
    except (json.JSONDecodeError, ValidationError):
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                return AudioReview.model_validate(json.loads(text[start : end + 1]))
            except (json.JSONDecodeError, ValidationError):
                pass

    return AudioReview(description=text[:500])
