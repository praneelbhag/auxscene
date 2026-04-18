import asyncio
from pathlib import Path
from uuid import uuid4

from google.genai import types

from ...pipeline.gemini import create_client
from ..config import get_settings


def _generate_and_save_image(prompt: str, image_path: Path) -> None:
    settings = get_settings()
    client = create_client(settings)
    response = client.models.generate_images(
        model=settings.gemini_image_model,
        prompt=f"Atmospheric scene: {prompt}, cinematic lighting, wide angle, moody",
        config=types.GenerateImagesConfig(
            number_of_images=1,
            aspect_ratio=settings.gemini_image_aspect_ratio,
        ),
    )

    generated_images = getattr(response, "generated_images", None)
    if not generated_images:
        raise ValueError("Gemini image generation did not return any images")

    generated_images[0].image.save(str(image_path))


async def generate_image(prompt: str, output_dir: Path, scene_id: str | None = None) -> Path:
    scene_key = scene_id or uuid4().hex
    image_path = output_dir / f"scene_{scene_key}.png"
    await asyncio.to_thread(_generate_and_save_image, prompt, image_path)
    return image_path
