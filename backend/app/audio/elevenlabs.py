import asyncio
from collections.abc import Sequence

import httpx


ELEVENLABS_SOUND_GENERATION_URL = "https://api.elevenlabs.io/v1/sound-generation"


async def generate_sound(
    *,
    api_key: str,
    sound_prompt: str,
    duration_seconds: float,
    client: httpx.AsyncClient,
) -> bytes:
    response = await client.post(
        ELEVENLABS_SOUND_GENERATION_URL,
        headers={"xi-api-key": api_key},
        json={
            "text": sound_prompt,
            "duration_seconds": duration_seconds,
            "prompt_influence": 0.3,
        },
        timeout=90.0,
    )
    response.raise_for_status()
    return response.content


async def generate_all_sounds(
    *,
    api_key: str,
    sound_prompts: Sequence[str],
    duration_seconds: float,
) -> list[bytes]:
    async with httpx.AsyncClient() as client:
        tasks = [
            generate_sound(
                api_key=api_key,
                sound_prompt=sound_prompt,
                duration_seconds=duration_seconds,
                client=client,
            )
            for sound_prompt in sound_prompts
        ]
        return await asyncio.gather(*tasks)
