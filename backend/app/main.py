from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.pipeline.router import router as pipeline_router

from .audio.router import router as audio_router
from .config import get_settings
from .database import init_db
from .user_router import router as user_router

settings = get_settings()
init_db()

app = FastAPI(
    title="SoundScene API",
    description="Text-to-spatial audio generation backend.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.parsed_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pipeline_router)
app.include_router(user_router)
settings.output_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static/outputs", StaticFiles(directory=settings.output_dir), name="static-outputs")
app.include_router(audio_router)


@app.get("/api/health")
async def health_check() -> dict[str, object]:
    return {
        "status": "ok",
        "missingProviderKeys": settings.missing_provider_keys,
        "llmModel": settings.gemini_model,
        "thinkingLevel": settings.gemini_thinking_level,
        "googleSearchGroundingEnabled": settings.enable_google_search_grounding,
        "imageModel": settings.gemini_image_model,
        "imageAspectRatio": settings.gemini_image_aspect_ratio,
        "audioCacheEnabled": settings.audio_cache_enabled,
        "audioReviewEnabled": settings.audio_review_enabled,
        "audioReviewAutoRetry": settings.audio_review_auto_retry,
    }
