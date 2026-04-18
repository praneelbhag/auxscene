from backend.app.config import Settings

from .gemini import create_client, generation_config


CLASSIFIER_PROMPT = """Classify whether this scene description is ABSTRACT or CONCRETE.
ABSTRACT: emotional, conceptual, no specific physical sound sources (e.g., "peace", "chaos", "nostalgia")
CONCRETE: names physical places, objects, weather, or environments that produce identifiable sounds (e.g., "rainy street", "coffee shop", "forest at dawn")
Respond with only: ABSTRACT or CONCRETE"""


def classify_prompt(prompt: str, settings: Settings) -> bool:
    client = create_client(settings)
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=f"{CLASSIFIER_PROMPT}\n\nScene description: {prompt}",
        config=generation_config(settings),
    )

    classification = (response.text or "").strip().upper()
    return classification.startswith("ABSTRACT")
