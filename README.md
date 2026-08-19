# aux.scene

Text-to-spatial audio generation for immersive, draggable sound scenes.

## Project Setup

This repo is split into a FastAPI backend for orchestration/audio rendering and a Vite React frontend for the spatial editor.

### Environment

Copy `.env.example` to `.env`, then add the required provider keys:

- `ANTHROPIC_API_KEY` for Claude abstract detection, decomposition, prompt refinement, web grounding, and image-input analysis
- `ELEVENLABS_API_KEY` for Sound Effects generation
- `AUDIO_CACHE_*` tunes reuse of generated stems

Keep real keys in `.env`. Commit-safe defaults live in `.env.example`.
Automatic audio review and scene-image generation are currently disabled. The image-input endpoint still uses Claude vision to translate an uploaded frame into a soundscape.

### Backend Dependencies

Use Python 3.11 or newer.

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

The response includes `original_prompt`, `is_abstract`, `grounding_sources`, `concrete_description`, and 3-6 spatial `elements`. Abstract prompts can use Claude web-search grounding before decomposition; concrete prompts skip grounding and decompose directly.

Each element also carries generation hints (`duration_seconds`, `prompt_influence`, and `loop`), mix script fields (`start_seconds`, `gain_db`, `density`, EQ cuts, and ducking), prompt-planning notes, and a cache key hint. The audio backend uses those fields to generate tighter ElevenLabs prompts and reuse matching cached sounds. A local signal-level check can retry a near-silent generation, but no model-based audio review runs.

The fuller audio architecture is documented in [`docs/audio-pipeline.md`](docs/audio-pipeline.md).

`POST /api/decompose-image` accepts a PNG, JPEG, or WebP frame plus optional direction. Claude analyzes visible objects, spatial regions, implied foley, and scene vibe, then returns the same `DecomposeResponse` contract as text prompts so the audio generation path stays identical.

## Provider Map

| Feature | Dependency | Env |
|---|---|---|
| Abstract detection, scene decomposition, and prompt refinement | `anthropic` | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |
| Web search grounding | Claude web search | `ANTHROPIC_API_KEY`, `ENABLE_WEB_SEARCH_GROUNDING` |
| Image-input analysis | Claude vision | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |
| Sound effect generation | `elevenlabs` | `ELEVENLABS_API_KEY` |
| Sound effect concurrency | Backend request queue | `ELEVENLABS_MAX_CONCURRENT_REQUESTS` |
| Audio cache | Local PCM cache | `AUDIO_CACHE_ENABLED`, `AUDIO_CACHE_SIMILARITY_THRESHOLD`, `AUDIO_CACHE_DIR` |
| Spatial DSP and export | `pedalboard`, `numpy`, `scipy`, built-in WAV export | `MIX_SAMPLE_RATE`, `MIX_CHANNELS` |
| Spatial editor | React, Web Audio API, WaveSurfer | `VITE_API_BASE_URL` |
