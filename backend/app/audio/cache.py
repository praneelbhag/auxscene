import hashlib
import json
import re
from threading import Lock
from dataclasses import dataclass
from pathlib import Path
from tempfile import NamedTemporaryFile

from backend.app.config import Settings

from .schemas import SceneElement


@dataclass
class CachedAudio:
    audio_bytes: bytes
    cache_hit: bool
    similarity: float | None = None


_CACHE_LOCK = Lock()


def get_cached_audio(element: SceneElement, settings: Settings, duration_seconds: float) -> CachedAudio | None:
    if not settings.audio_cache_enabled:
        return None

    settings.audio_cache_dir.mkdir(parents=True, exist_ok=True)
    with _CACHE_LOCK:
        index = _load_index(settings.audio_cache_dir)
        exact_key = build_cache_key(element, settings, duration_seconds)
        exact = index.get(exact_key)
        if exact:
            path = settings.audio_cache_dir / exact["filename"]
            if path.exists():
                return CachedAudio(audio_bytes=path.read_bytes(), cache_hit=True, similarity=1.0)

        similar_key, similarity = _find_similar_key(
            element,
            settings,
            duration_seconds,
            index,
            settings.audio_cache_similarity_threshold,
        )
        if similar_key:
            path = settings.audio_cache_dir / index[similar_key]["filename"]
            if path.exists():
                return CachedAudio(audio_bytes=path.read_bytes(), cache_hit=True, similarity=similarity)

    return None


def save_cached_audio(
    element: SceneElement,
    settings: Settings,
    duration_seconds: float,
    audio_bytes: bytes,
) -> None:
    if not settings.audio_cache_enabled:
        return

    settings.audio_cache_dir.mkdir(parents=True, exist_ok=True)
    with _CACHE_LOCK:
        key = build_cache_key(element, settings, duration_seconds)
        filename = f"{key}.pcm"
        target = settings.audio_cache_dir / filename

        with NamedTemporaryFile(delete=False, dir=settings.audio_cache_dir) as tmp:
            tmp.write(audio_bytes)
            tmp_path = Path(tmp.name)

        tmp_path.replace(target)

        index = _load_index(settings.audio_cache_dir)
        index[key] = {
            "filename": filename,
            "prompt": element.sound_prompt,
            "canonical_prompt": _canonical_prompt(element),
            "tokens": sorted(_tokens(_canonical_prompt(element))),
            "model_id": settings.elevenlabs_model_id,
            "output_format": settings.elevenlabs_output_format,
            "duration_seconds": duration_seconds,
            "prompt_influence": _prompt_influence(element, settings),
            "loop": bool(element.generation.loop),
        }
        _save_index(settings.audio_cache_dir, index)


def build_cache_key(element: SceneElement, settings: Settings, duration_seconds: float) -> str:
    payload = {
        "prompt": _canonical_prompt(element),
        "model_id": settings.elevenlabs_model_id,
        "output_format": settings.elevenlabs_output_format,
        "duration_seconds": round(duration_seconds, 2),
        "prompt_influence": round(_prompt_influence(element, settings), 3),
        "loop": bool(element.generation.loop),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()[:24]


def _find_similar_key(
    element: SceneElement,
    settings: Settings,
    duration_seconds: float,
    index: dict[str, dict],
    threshold: float,
) -> tuple[str | None, float | None]:
    current_tokens = _tokens(_canonical_prompt(element))
    if not current_tokens:
        return None, None

    best_key = None
    best_similarity = 0.0
    for key, entry in index.items():
        if entry.get("model_id") != settings.elevenlabs_model_id:
            continue
        if entry.get("output_format") != settings.elevenlabs_output_format:
            continue
        if abs(float(entry.get("duration_seconds", 0)) - duration_seconds) > 0.5:
            continue
        if abs(float(entry.get("prompt_influence", 0)) - _prompt_influence(element, settings)) > 0.1:
            continue
        if bool(entry.get("loop")) != bool(element.generation.loop):
            continue

        entry_tokens = set(entry.get("tokens", []))
        if not entry_tokens:
            entry_tokens = _tokens(str(entry.get("canonical_prompt", "")))
        similarity = len(current_tokens & entry_tokens) / len(current_tokens | entry_tokens)
        if similarity > best_similarity:
            best_key = key
            best_similarity = similarity

    if best_key and best_similarity >= threshold:
        return best_key, best_similarity

    return None, None


def _canonical_prompt(element: SceneElement) -> str:
    return element.cache_key_hint or element.sound_prompt


def _prompt_influence(element: SceneElement, settings: Settings) -> float:
    return element.generation.prompt_influence or settings.elevenlabs_prompt_influence


def _tokens(text: str) -> set[str]:
    return {
        token
        for token in re.sub(r"[^a-z0-9\s]", " ", text.lower()).split()
        if len(token) > 2 and token not in {"the", "and", "for", "with", "without"}
    }


def _load_index(cache_dir: Path) -> dict[str, dict]:
    path = cache_dir / "index.json"
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _save_index(cache_dir: Path, index: dict[str, dict]) -> None:
    path = cache_dir / "index.json"
    path.write_text(json.dumps(index, indent=2, sort_keys=True), encoding="utf-8")
