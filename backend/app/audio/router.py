import asyncio
from dataclasses import dataclass, field
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status
from pydub import AudioSegment

from ..config import get_settings
from .elevenlabs import generate_all_sounds
from .image_gen import generate_image
from .schemas import (
    GenerateElementResponse,
    GenerateRequest,
    GenerateResponse,
    JobStatusResponse,
)
from .spatial_dsp import (
    apply_spatial,
    enforce_duration,
    mix_all,
    mp3_bytes_to_audio_segment,
    normalize_for_mix,
)

router = APIRouter(prefix="/api", tags=["audio"])
settings = get_settings()


@dataclass
class JobState:
    status: str = "queued"
    completed_elements: list[str] = field(default_factory=list)
    total_elements: int = 0
    error: str | None = None
    audio_url: str | None = None
    image_url: str | None = None


_JOB_STATUS: dict[str, JobState] = {}


def _ensure_output_dir() -> Path:
    output_dir = settings.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def _static_url(path: Path) -> str:
    return f"/static/outputs/{path.name}"


@router.post("/generate", response_model=GenerateResponse, status_code=status.HTTP_200_OK)
async def generate_scene(payload: GenerateRequest) -> GenerateResponse:
    if not settings.elevenlabs_api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ELEVENLABS_API_KEY is not configured",
        )

    job_id = uuid4().hex
    job_state = JobState(status="running", total_elements=len(payload.elements))
    _JOB_STATUS[job_id] = job_state
    output_dir = _ensure_output_dir()
    duration = payload.duration_seconds
    scene_stem = f"scene_{job_id}"

    try:
        sound_prompts = [element.sound_prompt for element in payload.elements]
        audio_task = asyncio.create_task(
            generate_all_sounds(
                api_key=settings.elevenlabs_api_key,
                sound_prompts=sound_prompts,
                duration_seconds=duration,
            )
        )
        image_task = asyncio.create_task(generate_image(payload.concrete_description, output_dir, job_id))
        mp3_results, image_path = await asyncio.gather(audio_task, image_task)

        processed_tracks: list[AudioSegment] = []
        element_responses: list[GenerateElementResponse] = []

        for index, element in enumerate(payload.elements):
            audio = mp3_bytes_to_audio_segment(mp3_results[index])
            audio = enforce_duration(audio, duration)
            audio = normalize_for_mix(audio, settings.mix_sample_rate, settings.mix_channels)
            processed = apply_spatial(audio, element.x, element.y, element.reverb)
            processed_tracks.append(processed)

            elem_file = output_dir / f"{element.id}_{job_id}.wav"
            processed.export(elem_file, format="wav")
            element_responses.append(
                GenerateElementResponse(
                    id=element.id,
                    label=element.label,
                    x=element.x,
                    y=element.y,
                    reverb=element.reverb,
                    individual_audio_url=_static_url(elem_file),
                )
            )
            job_state.completed_elements.append(element.id)

        mixed = mix_all(processed_tracks, duration_seconds=duration, sample_rate=settings.mix_sample_rate)
        mixed_file = output_dir / f"{scene_stem}.wav"
        mixed.export(mixed_file, format="wav")

        audio_url = _static_url(mixed_file)
        image_url = _static_url(image_path)
        job_state.status = "completed"
        job_state.audio_url = audio_url
        job_state.image_url = image_url

        return GenerateResponse(
            job_id=job_id,
            audio_url=audio_url,
            image_url=image_url,
            elements=element_responses,
            duration_seconds=duration,
        )
    except Exception as exc:
        job_state.status = "failed"
        job_state.error = str(exc)
        raise


@router.get("/status/{job_id}", response_model=JobStatusResponse, status_code=status.HTTP_200_OK)
async def get_status(job_id: str) -> JobStatusResponse:
    job = _JOB_STATUS.get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job_id not found")

    return JobStatusResponse(
        job_id=job_id,
        status=job.status,  # type: ignore[arg-type]
        completed_elements=job.completed_elements,
        total_elements=job.total_elements,
        error=job.error,
        audio_url=job.audio_url,
        image_url=job.image_url,
    )
