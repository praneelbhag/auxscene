import base64
from typing import Any

from anthropic import Anthropic

from backend.app.config import Settings


def create_client(settings: Settings) -> Anthropic:
    if not settings.anthropic_api_key or settings.anthropic_api_key.startswith("your_"):
        raise RuntimeError("ANTHROPIC_API_KEY is missing or still set to a placeholder.")

    return Anthropic(api_key=settings.anthropic_api_key)


def generate_text(
    *,
    prompt: str,
    settings: Settings,
    max_tokens: int = 2048,
    image_bytes: bytes | None = None,
    image_mime_type: str | None = None,
    web_search: bool = False,
) -> str:
    content: list[dict[str, Any]] = []
    if image_bytes is not None:
        if not image_mime_type:
            raise ValueError("image_mime_type is required when image_bytes are provided.")
        content.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": image_mime_type,
                    "data": base64.b64encode(image_bytes).decode("ascii"),
                },
            }
        )
    content.append({"type": "text", "text": prompt})

    request: dict[str, Any] = {
        "model": settings.anthropic_model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": content}],
    }
    if web_search and settings.enable_web_search_grounding:
        request["tools"] = [
            {
                "type": "web_search_20250305",
                "name": "web_search",
                "max_uses": 3,
            }
        ]

    response = create_client(settings).messages.create(**request)
    text_blocks = [
        block.text
        for block in response.content
        if getattr(block, "type", None) == "text"
    ]
    if not text_blocks:
        raise RuntimeError("Claude returned no text content.")
    return "\n".join(text_blocks)
