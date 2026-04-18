from google import genai
from google.genai import types

from backend.app.config import Settings


def create_client(settings: Settings) -> genai.Client:
    if not settings.gemini_api_key or settings.gemini_api_key.startswith("your_"):
        raise RuntimeError("GEMINI_API_KEY is missing or still set to a placeholder.")

    return genai.Client(api_key=settings.gemini_api_key)


def generation_config(
    settings: Settings,
    *,
    json_mode: bool = False,
    google_search: bool = False,
) -> types.GenerateContentConfig:
    config: dict[str, object] = {
        "thinking_config": types.ThinkingConfig(
            thinking_level=settings.gemini_thinking_level,
        ),
    }

    if json_mode:
        config["response_mime_type"] = "application/json"

    if google_search and settings.enable_google_search_grounding:
        config["tools"] = [{"google_search": {}}]

    return types.GenerateContentConfig(**config)
