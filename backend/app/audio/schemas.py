from typing import Literal

from pydantic import BaseModel, Field


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


class AudioReview(BaseModel):
    score: float | None = Field(default=None, ge=0.0, le=1.0)
    description: str | None = None
    issues: list[str] = Field(default_factory=list)
    suggested_prompt: str | None = None


class SceneElement(BaseModel):
    id: str
    sound_prompt: str
    label: str
    x: float = Field(ge=-1.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    reverb: float = Field(ge=0.0, le=1.0)
    layer: Literal["background", "midground", "foreground"] | str = "midground"
    generation: GenerationSettings = Field(default_factory=GenerationSettings)
    mix: MixSettings = Field(default_factory=MixSettings)
    reviewer_notes: list[str] = Field(default_factory=list)
    cache_key_hint: str | None = None


class GenerateRequest(BaseModel):
    original_prompt: str
    concrete_description: str
    elements: list[SceneElement]
    duration_seconds: float = Field(default=10.0, ge=1.0, le=20.0)


class GenerateElementResponse(BaseModel):
    id: str
    label: str
    sound_prompt: str | None = None
    x: float
    y: float
    reverb: float
    layer: str | None = None
    generation: GenerationSettings | None = None
    mix: MixSettings | None = None
    reviewer_notes: list[str] = Field(default_factory=list)
    cache_key_hint: str | None = None
    cache_hit: bool = False
    cache_similarity: float | None = None
    audio_review: AudioReview | None = None
    playback_warning: str | None = None
    individual_audio_url: str


class GenerateResponse(BaseModel):
    job_id: str
    audio_url: str
    image_url: str | None = None
    elements: list[GenerateElementResponse]
    duration_seconds: float


class RegenerateElementRequest(BaseModel):
    element: SceneElement
    edit_instruction: str | None = None
    original_prompt: str | None = None
    concrete_description: str | None = None


class RegenerateElementResponse(BaseModel):
    element: GenerateElementResponse


class JobStatusResponse(BaseModel):
    job_id: str
    status: Literal["queued", "running", "completed", "failed"]
    completed_elements: list[str] = Field(default_factory=list)
    total_elements: int = 0
    error: str | None = None
    audio_url: str | None = None
    image_url: str | None = None
