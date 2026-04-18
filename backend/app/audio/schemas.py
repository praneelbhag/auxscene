from typing import Literal

from pydantic import BaseModel, Field


class SceneElement(BaseModel):
    id: str
    sound_prompt: str
    label: str
    x: float = Field(ge=-1.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    reverb: float = Field(ge=0.0, le=1.0)
    layer: Literal["background", "midground", "foreground"] | str = "midground"


class GenerateRequest(BaseModel):
    original_prompt: str
    concrete_description: str
    elements: list[SceneElement]
    duration_seconds: float = Field(default=10.0, ge=1.0, le=20.0)


class GenerateElementResponse(BaseModel):
    id: str
    label: str
    x: float
    y: float
    reverb: float
    individual_audio_url: str


class GenerateResponse(BaseModel):
    job_id: str
    audio_url: str
    image_url: str
    elements: list[GenerateElementResponse]
    duration_seconds: float


class JobStatusResponse(BaseModel):
    job_id: str
    status: Literal["queued", "running", "completed", "failed"]
    completed_elements: list[str] = Field(default_factory=list)
    total_elements: int = 0
    error: str | None = None
    audio_url: str | None = None
    image_url: str | None = None
