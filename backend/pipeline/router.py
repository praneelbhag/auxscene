import asyncio

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from backend.app.config import get_settings

from .classifier import classify_prompt
from .decomposer import decompose_scene
from .grounding import ground_abstract_prompt
from .image_analyzer import analyze_image_scene
from .prompt_refiner import refine_sound_prompts
from .schemas import DecomposeRequest, DecomposeResponse

router = APIRouter(prefix="/api", tags=["pipeline"])

SUPPORTED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 8 * 1024 * 1024


@router.post("/decompose", response_model=DecomposeResponse)
async def decompose(request: DecomposeRequest) -> DecomposeResponse:
    settings = get_settings()
    prompt = request.prompt.strip()

    try:
        is_abstract = await asyncio.to_thread(classify_prompt, prompt, settings)

        if is_abstract:
            grounding = await asyncio.to_thread(ground_abstract_prompt, prompt, settings)
            grounding_sources = grounding.grounding_sources
            concrete_description = grounding.concrete_description
        else:
            grounding_sources = []
            concrete_description = prompt

        decomposition = await asyncio.to_thread(
            decompose_scene,
            concrete_description,
            settings,
        )
        refined_elements = await asyncio.to_thread(
            refine_sound_prompts,
            original_prompt=prompt,
            concrete_description=decomposition.concrete_description,
            elements=decomposition.elements,
            settings=settings,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Claude pipeline failed: {exc}",
        ) from exc

    return DecomposeResponse(
        original_prompt=prompt,
        is_abstract=is_abstract,
        grounding_sources=grounding_sources,
        concrete_description=decomposition.concrete_description,
        elements=refined_elements,
    )


@router.post("/decompose-image", response_model=DecomposeResponse)
async def decompose_image(
    image: UploadFile = File(...),
    prompt: str | None = Form(default=None),
) -> DecomposeResponse:
    settings = get_settings()
    mime_type = image.content_type or ""
    if mime_type not in SUPPORTED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Upload a PNG, JPEG, or WebP image.",
        )

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded image is empty.",
        )
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image must be 8 MB or smaller.",
        )

    user_context = prompt.strip() if prompt and prompt.strip() else None
    original_prompt = user_context or f"image input: {image.filename or 'uploaded frame'}"

    try:
        analysis = await asyncio.to_thread(
            analyze_image_scene,
            image_bytes=image_bytes,
            mime_type=mime_type,
            settings=settings,
            user_context=user_context,
        )
        image_context = _analysis_to_decomposition_context(analysis)
        decomposition = await asyncio.to_thread(
            decompose_scene,
            image_context,
            settings,
        )
        refined_elements = await asyncio.to_thread(
            refine_sound_prompts,
            original_prompt=original_prompt,
            concrete_description=decomposition.concrete_description,
            elements=decomposition.elements,
            settings=settings,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Claude image-analysis pipeline failed: {exc}",
        ) from exc

    return DecomposeResponse(
        original_prompt=original_prompt,
        is_abstract=False,
        grounding_sources=[
            *analysis.grounding_sources,
            *[
                f"{item.label} ({item.location}): {item.likely_sound}"
                for item in analysis.visible_objects[:6]
            ],
        ],
        concrete_description=decomposition.concrete_description,
        elements=refined_elements,
    )


def _analysis_to_decomposition_context(analysis) -> str:
    objects = "; ".join(
        f"{item.label} at {item.location} -> {item.likely_sound} ({item.layer})"
        for item in analysis.visible_objects
    )
    return (
        f"{analysis.concrete_description}\n"
        f"Overall sonic vibe: {analysis.vibe}\n"
        f"Visible sound sources and spatial hints: {objects or 'none'}"
    )
