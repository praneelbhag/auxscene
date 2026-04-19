from dataclasses import dataclass, field
from pathlib import Path
from uuid import uuid4
import asyncio

from fastapi import APIRouter, HTTPException, Request, status
import httpx

from ..config import get_settings
from .audio_review import review_audio_file
from .cache import get_cached_audio, save_cached_audio
from .elevenlabs import ElevenLabsGenerationError, generate_sound
from .image_gen import generate_image
from .schemas import (
    AudioReview,
    GenerateElementResponse,
    GenerateRequest,
    GenerateResponse,
    JobStatusResponse,
    RegenerateElementRequest,
    RegenerateElementResponse,
    SceneElement,
)
from .spatial_dsp import (
    AudioTrack,
    PositionedAudioTrack,
    apply_spatial,
    audio_level_dbfs,
    audio_bytes_to_audio_track,
    condition_for_natural_mix,
    enforce_duration,
    export_wav,
    mix_timeline,
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


def _static_url(request: Request, path: Path) -> str:
    return str(request.url_for("static-outputs", path=path.name))


def _element_duration(element: SceneElement, fallback: float) -> float:
    return element.generation.duration_seconds or fallback


def _element_prompt_influence(element: SceneElement) -> float:
    return element.generation.prompt_influence or settings.elevenlabs_prompt_influence


def _element_start(element: SceneElement) -> float:
    return element.mix.start_seconds


async def _get_or_generate_audio_bytes(
    *,
    element: SceneElement,
    duration_seconds: float,
    client: httpx.AsyncClient,
    save_cache: bool = True,
) -> tuple[bytes, bool, float | None]:
    cached = get_cached_audio(element, settings, duration_seconds)
    if cached:
        return cached.audio_bytes, cached.cache_hit, cached.similarity

    audio_bytes = await generate_sound(
        api_key=settings.elevenlabs_api_key,
        sound_prompt=element.sound_prompt,
        duration_seconds=duration_seconds,
        model_id=settings.elevenlabs_model_id,
        output_format=settings.elevenlabs_output_format,
        prompt_influence=_element_prompt_influence(element),
        loop=element.generation.loop,
        client=client,
    )
    if save_cache:
        save_cached_audio(element, settings, duration_seconds, audio_bytes)
    return audio_bytes, False, None


def _process_element_audio(
    *,
    element: SceneElement,
    audio_bytes: bytes,
    output_dir: Path,
    job_id: str,
    duration_seconds: float,
) -> tuple[AudioTrack, Path]:
    audio = audio_bytes_to_audio_track(audio_bytes, settings.elevenlabs_output_format)
    audio = enforce_duration(audio, duration_seconds)
    audio = normalize_for_mix(audio, settings.mix_sample_rate, settings.mix_channels)
    audio = condition_for_natural_mix(
        audio,
        element.layer,
        gain_db=element.mix.gain_db,
        high_cut_hz=element.mix.high_cut_hz,
        low_cut_hz=element.mix.low_cut_hz,
        fade_ms=element.mix.fade_ms,
    )
    processed = apply_spatial(audio, element.x, element.y, element.reverb)

    elem_file = output_dir / f"{element.id}_{job_id}.wav"
    export_wav(processed, elem_file)
    return processed, elem_file


def _playback_warning(audio: AudioTrack, element: SceneElement) -> str | None:
    rms_dbfs, peak = audio_level_dbfs(audio)
    if peak < 0.003 or rms_dbfs < -58.0:
        return (
            f"{element.label} generated as near-silent audio "
            f"({rms_dbfs:.1f} dB RMS). Try regenerating this sound."
        )
    return None


def _should_retry_after_review(audio_review: AudioReview | None) -> bool:
    if not settings.audio_review_auto_retry or audio_review is None:
        return False
    if audio_review.score is None or not audio_review.suggested_prompt:
        return False
    return audio_review.score < settings.audio_review_min_score


def _apply_reviewer_suggestion(
    element: SceneElement,
    audio_review: AudioReview,
) -> SceneElement:
    if not audio_review.suggested_prompt:
        return element

    data = element.model_dump()
    data["sound_prompt"] = audio_review.suggested_prompt
    data["cache_key_hint"] = audio_review.suggested_prompt.lower()
    data["reviewer_notes"] = [
        *element.reviewer_notes,
        f"Audio reviewer retry: {', '.join(audio_review.issues[:2]) or 'low match score'}",
    ]
    return SceneElement.model_validate(data)


async def _render_element(
    *,
    element: SceneElement,
    request: Request,
    output_dir: Path,
    job_id: str,
    duration_seconds: float,
    client: httpx.AsyncClient,
) -> tuple[AudioTrack, GenerateElementResponse]:
    defer_cache_save = settings.audio_review_enabled and settings.audio_review_auto_retry
    audio_bytes, cache_hit, cache_similarity = await _get_or_generate_audio_bytes(
        element=element,
        duration_seconds=duration_seconds,
        client=client,
        save_cache=not defer_cache_save,
    )
    processed, elem_file = _process_element_audio(
        element=element,
        audio_bytes=audio_bytes,
        output_dir=output_dir,
        job_id=job_id,
        duration_seconds=duration_seconds,
    )
    playback_warning = _playback_warning(processed, element)

    audio_review: AudioReview | None = None
    if not cache_hit:
        audio_review = await review_audio_file(
            audio_path=elem_file,
            element=element,
            settings=settings,
        )
    response_element = element

    if _should_retry_after_review(audio_review):
        response_element = _apply_reviewer_suggestion(element, audio_review)
        audio_bytes, cache_hit, cache_similarity = await _get_or_generate_audio_bytes(
            element=response_element,
            duration_seconds=duration_seconds,
            client=client,
            save_cache=False,
        )
        processed, elem_file = _process_element_audio(
            element=response_element,
            audio_bytes=audio_bytes,
            output_dir=output_dir,
            job_id=job_id,
            duration_seconds=duration_seconds,
        )
        playback_warning = _playback_warning(processed, response_element)
        audio_review = None
        if not cache_hit:
            audio_review = await review_audio_file(
                audio_path=elem_file,
                element=response_element,
                settings=settings,
            )

    if defer_cache_save and not cache_hit:
        save_cached_audio(response_element, settings, duration_seconds, audio_bytes)

    return processed, GenerateElementResponse(
        id=response_element.id,
        label=response_element.label,
        sound_prompt=response_element.sound_prompt,
        x=response_element.x,
        y=response_element.y,
        reverb=response_element.reverb,
        layer=response_element.layer,
        generation=response_element.generation,
        mix=response_element.mix,
        reviewer_notes=response_element.reviewer_notes,
        cache_key_hint=response_element.cache_key_hint,
        cache_hit=cache_hit,
        cache_similarity=cache_similarity,
        audio_review=audio_review,
        playback_warning=playback_warning,
        individual_audio_url=_static_url(request, elem_file),
    )


def _apply_edit_instruction(element: SceneElement, edit_instruction: str | None) -> SceneElement:
    if not edit_instruction:
        return element

    data = element.model_dump()
    data["sound_prompt"] = (
        f"{element.sound_prompt}. User refinement: {edit_instruction}. "
        "Keep it realistic, no music, no speech."
    )
    data["cache_key_hint"] = None
    data["reviewer_notes"] = [
        *element.reviewer_notes,
        f"User refinement applied: {edit_instruction}",
    ]
    return SceneElement.model_validate(data)


@router.post("/generate", response_model=GenerateResponse, status_code=status.HTTP_200_OK)
async def generate_scene(payload: GenerateRequest, request: Request) -> GenerateResponse:
    if not settings.elevenlabs_api_key or settings.elevenlabs_api_key.startswith("your_"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ELEVENLABS_API_KEY is not configured",
        )

    job_id = uuid4().hex
    job_state = JobState(status="running", total_elements=len(payload.elements))
    _JOB_STATUS[job_id] = job_state
    output_dir = _ensure_output_dir()
    duration = max(
        [
            payload.duration_seconds,
            *[
                _element_start(element) + _element_duration(element, payload.duration_seconds)
                for element in payload.elements
            ],
        ]
    )
    scene_stem = f"scene_{job_id}"

    try:
        image_task = asyncio.create_task(
            generate_image(
                prompt=payload.concrete_description or payload.original_prompt,
                output_dir=output_dir,
                scene_id=job_id,
            )
        )

        async with httpx.AsyncClient() as client:
            render_tasks = [
                asyncio.create_task(
                    _render_element(
                        element=element,
                        request=request,
                        output_dir=output_dir,
                        job_id=job_id,
                        duration_seconds=_element_duration(element, payload.duration_seconds),
                        client=client,
                    )
                )
                for element in payload.elements
            ]
            rendered = await asyncio.gather(*render_tasks)

        processed_tracks: list[PositionedAudioTrack] = []
        element_responses: list[GenerateElementResponse] = []

        for element, (processed, response) in zip(payload.elements, rendered, strict=True):
            processed_tracks.append(
                PositionedAudioTrack(
                    track=processed,
                    start_seconds=_element_start(element),
                    layer=element.layer,
                    duck_background=element.mix.duck_background,
                )
            )
            element_responses.append(response)
            job_state.completed_elements.append(element.id)

        mixed = mix_timeline(
            processed_tracks,
            duration_seconds=duration,
            sample_rate=settings.mix_sample_rate,
        )
        mixed_file = output_dir / f"{scene_stem}.wav"
        export_wav(mixed, mixed_file)

        audio_url = _static_url(request, mixed_file)
        image_url = None
        try:
            image_file = await image_task
            image_url = _static_url(request, image_file)
        except Exception as exc:
            job_state.error = f"Image generation failed: {exc}"

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
    except ElevenLabsGenerationError as exc:
        if "image_task" in locals():
            image_task.cancel()
        job_state.status = "failed"
        job_state.error = str(exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        if "image_task" in locals():
            image_task.cancel()
        job_state.status = "failed"
        job_state.error = str(exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Audio generation failed: {exc}",
        ) from exc


@router.post(
    "/regenerate-element",
    response_model=RegenerateElementResponse,
    status_code=status.HTTP_200_OK,
)
async def regenerate_element(
    payload: RegenerateElementRequest,
    request: Request,
) -> RegenerateElementResponse:
    if not settings.elevenlabs_api_key or settings.elevenlabs_api_key.startswith("your_"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ELEVENLABS_API_KEY is not configured",
        )

    output_dir = _ensure_output_dir()
    job_id = uuid4().hex
    element = _apply_edit_instruction(payload.element, payload.edit_instruction)
    duration = _element_duration(element, 6.0)

    try:
        async with httpx.AsyncClient() as client:
            _, response = await _render_element(
                element=element,
                request=request,
                output_dir=output_dir,
                job_id=job_id,
                duration_seconds=duration,
                client=client,
            )
        return RegenerateElementResponse(element=response)
    except ElevenLabsGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Element regeneration failed: {exc}",
        ) from exc


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
