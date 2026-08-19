from backend.app.config import Settings

from .anthropic import generate_text

CLASSIFIER_PROMPT = """Classify whether this scene description is ABSTRACT or CONCRETE.
ABSTRACT: emotional, conceptual, no specific physical sound sources (e.g., "peace", "chaos", "nostalgia")
CONCRETE: names physical places, objects, weather, or environments that produce identifiable sounds (e.g., "rainy street", "coffee shop", "forest at dawn")
Respond with only: ABSTRACT or CONCRETE"""


def classify_prompt(prompt: str, settings: Settings) -> bool:
    response = generate_text(
        prompt=f"{CLASSIFIER_PROMPT}\n\nScene description: {prompt}",
        settings=settings,
        max_tokens=64,
    )

    classification = response.strip().upper()
    return classification.startswith("ABSTRACT")
