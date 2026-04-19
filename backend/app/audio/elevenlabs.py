import asyncio
from collections.abc import Sequence

import httpx


ELEVENLABS_SOUND_GENERATION_URL = "https://api.elevenlabs.io/v1/sound-generation"


class ElevenLabsGenerationError(RuntimeError):
    pass


async def generate_sound(
    *,
    api_key: str,
    sound_prompt: str,
    duration_seconds: float,
    model_id: str,
    output_format: str,
    prompt_influence: float,
    loop: bool,
    client: httpx.AsyncClient,
) -> bytes:
    for attempt in range(3):
        try:
            response = await client.post(
                ELEVENLABS_SOUND_GENERATION_URL,
                headers={"xi-api-key": api_key},
                params={"output_format": output_format},
                json={
                    "text": sound_prompt,
                    "duration_seconds": duration_seconds,
                    "prompt_influence": prompt_influence,
                    "model_id": model_id,
                    "loop": loop,
                },
                timeout=120.0,
            )
            response.raise_for_status()
            return response.content
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            if status_code == 429 and attempt < 2:
                retry_after = exc.response.headers.get("retry-after")
                try:
                    delay = float(retry_after) if retry_after else 2.0 * (attempt + 1)
                except ValueError:
                    delay = 2.0 * (attempt + 1)
                await asyncio.sleep(delay)
                continue

            detail = exc.response.text[:500] if exc.response is not None else str(exc)
            raise ElevenLabsGenerationError(
                f"ElevenLabs returned {status_code}: {detail}"
            ) from exc
        except httpx.HTTPError as exc:
            raise ElevenLabsGenerationError(f"ElevenLabs request failed: {exc}") from exc

    raise ElevenLabsGenerationError("ElevenLabs request failed after retrying rate limits")


async def generate_all_sounds(
    *,
    api_key: str,
    sound_prompts: Sequence[str],
    duration_seconds: float,
    model_id: str,
    output_format: str,
    prompt_influence: float,
    loop: bool = False,
) -> list[bytes]:
    async with httpx.AsyncClient() as client:
        tasks = [
            generate_sound(
                api_key=api_key,
                sound_prompt=sound_prompt,
                duration_seconds=duration_seconds,
                model_id=model_id,
                output_format=output_format,
                prompt_influence=prompt_influence,
                loop=loop,
                client=client,
            )
            for sound_prompt in sound_prompts
        ]
        return await asyncio.gather(*tasks)
