import asyncio
from pathlib import Path
from uuid import uuid4

import httpx
import replicate


def _extract_replicate_url(output: object) -> str:
    if isinstance(output, str):
        return output
    if isinstance(output, list) and output:
        first = output[0]
        if isinstance(first, str):
            return first
    raise ValueError("Replicate output did not include an image URL")


def _run_replicate(prompt: str) -> object:
    return replicate.run(
        "black-forest-labs/flux-1.1-pro",
        input={
            "prompt": f"Atmospheric scene: {prompt}, cinematic lighting, wide angle, moody",
            "aspect_ratio": "16:9",
            "output_format": "png",
        },
    )


async def generate_image(prompt: str, output_dir: Path, scene_id: str | None = None) -> Path:
    output = await asyncio.to_thread(_run_replicate, prompt)
    image_url = _extract_replicate_url(output)
    scene_key = scene_id or uuid4().hex
    image_path = output_dir / f"scene_{scene_key}.png"

    async with httpx.AsyncClient() as client:
        response = await client.get(image_url, timeout=90.0)
        response.raise_for_status()
        image_path.write_bytes(response.content)

    return image_path
