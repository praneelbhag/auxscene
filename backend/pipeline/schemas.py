from typing import Literal

from pydantic import BaseModel, Field


Layer = Literal["foreground", "midground", "background"]


class DecomposeRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=1000)


class SoundElement(BaseModel):
    id: str
    sound_prompt: str = Field(min_length=1, max_length=160)
    label: str = Field(min_length=1, max_length=40)
    x: float = Field(ge=-1.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    reverb: float = Field(ge=0.0, le=1.0)
    layer: Layer


class DecomposeResponse(BaseModel):
    original_prompt: str
    is_abstract: bool
    grounding_sources: list[str]
    concrete_description: str
    elements: list[SoundElement] = Field(min_length=3, max_length=6)
