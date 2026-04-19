# SoundScene

Text-to-spatial audio generation for immersive, draggable sound scenes.

## Project Setup

This repo is split into a FastAPI backend for orchestration/audio rendering and a Vite React frontend for the spatial editor.

### Environment

`.env` has local placeholder values for the required provider keys and model settings:

- `GEMINI_API_KEY` for Gemini abstract detection, decomposition, and Google Search grounding
- `ELEVENLABS_API_KEY` for Sound Effects generation
- `GEMINI_IMAGE_MODEL` for Gemini native image generation with Nano Banana Pro
- `AUDIO_CACHE_*` and `AUDIO_REVIEW_*` tune reuse and automatic sound-quality review

Keep real keys in `.env`. Commit-safe defaults live in `.env.example`.

### Backend Dependencies

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload
```

Audio export writes WAV files directly from PCM, so FFmpeg is not required for the default ElevenLabs output format.

### Frontend Dependencies

```powershell
cd frontend
npm install
npm run dev
```

The frontend reads `VITE_API_BASE_URL` from the root `.env` file and defaults to `http://localhost:8000`.

## Decomposition Endpoint

`POST /api/decompose` turns a raw prompt into the shared SoundScene element contract.

```powershell
curl -X POST http://localhost:8000/api/decompose `
  -H "Content-Type: application/json" `
  -d '{"prompt": "peace and serenity"}'
```

The response includes `original_prompt`, `is_abstract`, `grounding_sources`, `concrete_description`, and 3-6 spatial `elements`. Abstract prompts use Gemini with Google Search grounding before decomposition; concrete prompts skip grounding and decompose directly.

Each element also carries generation hints (`duration_seconds`, `prompt_influence`, and `loop`), mix script fields (`start_seconds`, `gain_db`, `density`, EQ cuts, and ducking), reviewer notes, and a cache key hint. The audio backend uses those fields to generate tighter ElevenLabs prompts, reuse matching cached sounds, and optionally retry one low-scoring sound with the Gemini audio reviewer suggested prompt.

The fuller audio architecture is documented in [`docs/audio-pipeline.md`](docs/audio-pipeline.md).

## Provider Map

| Feature | Dependency | Env |
|---|---|---|
| Abstract detection and scene decomposition | `google-genai` | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| Web search grounding | Gemini Google Search grounding | `GEMINI_API_KEY`, `ENABLE_GOOGLE_SEARCH_GROUNDING` |
| Sound effect generation | `elevenlabs` | `ELEVENLABS_API_KEY` |
| Prompt review and audio review | Gemini | `GEMINI_API_KEY`, `AUDIO_REVIEW_ENABLED`, `AUDIO_REVIEW_MODEL`, `AUDIO_REVIEW_AUTO_RETRY` |
| Audio cache | Local PCM cache | `AUDIO_CACHE_ENABLED`, `AUDIO_CACHE_SIMILARITY_THRESHOLD`, `AUDIO_CACHE_DIR` |
| Spatial DSP and export | `pedalboard`, `numpy`, `scipy`, built-in WAV export | `MIX_SAMPLE_RATE`, `MIX_CHANNELS` |
| Image generation | Gemini native image generation, Nano Banana Pro | `GEMINI_API_KEY`, `GEMINI_IMAGE_MODEL`, `GEMINI_IMAGE_ASPECT_RATIO` |
| Spatial editor | React, Web Audio API, WaveSurfer | `VITE_API_BASE_URL` |
