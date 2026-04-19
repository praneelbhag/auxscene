from typing import Literal

from pydantic import BaseModel, Field


Layer = Literal["foreground", "midground", "background"]


class DecomposeRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=1000)


class GenerationSettings(BaseModel):
    loop: bool = False
    duration_seconds: float | None = Field(default=None, ge=0.5, le=30.0)
    prompt_influence: float | None = Field(default=None, ge=0.0, le=1.0)


class MixSettings(BaseModel):
    start_seconds: float = Field(default=0.0, ge=0.0, le=30.0)
    gain_db: float | None = Field(default=None, ge=-36.0, le=6.0)
    density: str = "continuous"
    role: str = "texture"
    high_cut_hz: float | None = Field(default=None, ge=300.0, le=20000.0)
    low_cut_hz: float | None = Field(default=None, ge=20.0, le=1000.0)
    duck_background: bool = False
    fade_ms: float | None = Field(default=None, ge=0.0, le=2000.0)


class SoundElement(BaseModel):
    id: str
    sound_prompt: str = Field(min_length=1, max_length=240)
    label: str = Field(min_length=1, max_length=40)
    x: float = Field(ge=-1.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    reverb: float = Field(ge=0.0, le=1.0)
    layer: Layer
    generation: GenerationSettings = Field(default_factory=GenerationSettings)
    mix: MixSettings = Field(default_factory=MixSettings)
    reviewer_notes: list[str] = Field(default_factory=list)
    cache_key_hint: str | None = None


class DecomposeResponse(BaseModel):
    original_prompt: str
    is_abstract: bool
    grounding_sources: list[str]
    concrete_description: str
    elements: list[SoundElement] = Field(min_length=3, max_length=6)
