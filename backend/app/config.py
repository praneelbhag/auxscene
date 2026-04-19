from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    elevenlabs_api_key: str = Field(default="", alias="ELEVENLABS_API_KEY")
    gemini_model: str = Field(default="gemini-3.1-pro-preview", alias="GEMINI_MODEL")
    gemini_image_model: str = Field(
        default="gemini-3-pro-image-preview",
        alias="GEMINI_IMAGE_MODEL",
    )
    gemini_thinking_level: str = Field(default="medium", alias="GEMINI_THINKING_LEVEL")
    enable_google_search_grounding: bool = Field(
        default=True,
        alias="ENABLE_GOOGLE_SEARCH_GROUNDING",
    )
    gemini_image_aspect_ratio: str = Field(default="16:9", alias="GEMINI_IMAGE_ASPECT_RATIO")
    elevenlabs_model_id: str = Field(
        default="eleven_text_to_sound_v2",
        alias="ELEVENLABS_MODEL_ID",
    )
    elevenlabs_output_format: str = Field(default="pcm_24000", alias="ELEVENLABS_OUTPUT_FORMAT")
    elevenlabs_prompt_influence: float = Field(default=0.3, alias="ELEVENLABS_PROMPT_INFLUENCE")
    elevenlabs_max_concurrent_requests: int = Field(
        default=5,
        alias="ELEVENLABS_MAX_CONCURRENT_REQUESTS",
        ge=1,
    )
    audio_cache_enabled: bool = Field(default=True, alias="AUDIO_CACHE_ENABLED")
    audio_cache_similarity_threshold: float = Field(
        default=0.92,
        alias="AUDIO_CACHE_SIMILARITY_THRESHOLD",
    )
    audio_review_enabled: bool = Field(default=True, alias="AUDIO_REVIEW_ENABLED")
    audio_review_model: str = Field(default="gemini-2.5-flash", alias="AUDIO_REVIEW_MODEL")
    audio_review_auto_retry: bool = Field(default=True, alias="AUDIO_REVIEW_AUTO_RETRY")
    audio_review_min_score: float = Field(default=0.72, alias="AUDIO_REVIEW_MIN_SCORE")

    backend_host: str = Field(default="127.0.0.1", alias="BACKEND_HOST")
    backend_port: int = Field(default=8000, alias="BACKEND_PORT")
    cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173",
        alias="CORS_ORIGINS",
    )
    output_dir: Path = Field(
        default=ROOT_DIR / "backend" / "static" / "outputs",
        alias="OUTPUT_DIR",
    )

    max_sound_duration_seconds: int = Field(default=20, alias="MAX_SOUND_DURATION_SECONDS")
    mix_sample_rate: int = Field(default=44100, alias="MIX_SAMPLE_RATE")
    mix_channels: int = Field(default=2, alias="MIX_CHANNELS")
    audio_cache_dir: Path = Field(
        default=ROOT_DIR / "generated" / "audio_cache",
        alias="AUDIO_CACHE_DIR",
    )

    @property
    def parsed_cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def missing_provider_keys(self) -> list[str]:
        required_keys = {
            "GEMINI_API_KEY": self.gemini_api_key,
            "ELEVENLABS_API_KEY": self.elevenlabs_api_key,
        }

        return [
            key
            for key, value in required_keys.items()
            if not value or value.startswith("your_")
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
