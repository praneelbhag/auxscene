import asyncio

from fastapi import APIRouter, HTTPException, status

from backend.app.config import get_settings

from .classifier import classify_prompt
from .decomposer import decompose_scene
from .grounding import ground_abstract_prompt
from .schemas import DecomposeRequest, DecomposeResponse

router = APIRouter(prefix="/api", tags=["pipeline"])


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
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gemini pipeline failed: {exc}",
        ) from exc

    return DecomposeResponse(
        original_prompt=prompt,
        is_abstract=is_abstract,
        grounding_sources=grounding_sources,
        concrete_description=decomposition.concrete_description,
        elements=decomposition.elements,
    )
