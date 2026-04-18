# Person 2 — Audio Generation + DSP Backend

## Your Role

You own everything from the decomposed JSON to playable audio and a scene image. You build the FastAPI endpoints that take sound elements, generate audio for each via ElevenLabs, spatially mix them, and return a WAV file plus a generated image.

---

## What You're Building

### Endpoint 1: `POST /api/generate`

**Input:** The output from Person 1's `/api/decompose` endpoint (or a hardcoded stub of it).

```json
{
  "original_prompt": "rainy Tokyo street at night",
  "concrete_description": "A rainy Tokyo street at night with neon reflections...",
  "elements": [
    {
      "id": "elem_1",
      "sound_prompt": "heavy rain hitting pavement, urban, steady downpour",
      "label": "Heavy Rain",
      "x": 0.0,
      "y": 0.8,
      "reverb": 0.4,
      "layer": "background"
    },
    {
      "id": "elem_2",
      "sound_prompt": "footsteps on wet pavement, slow walking pace",
      "label": "Footsteps",
      "x": -0.3,
      "y": 0.15,
      "reverb": 0.1,
      "layer": "foreground"
    }
  ]
}
```

**Output:**
```json
{
  "audio_url": "/static/outputs/scene_abc123.wav",
  "image_url": "/static/outputs/scene_abc123.png",
  "elements": [
    {
      "id": "elem_1",
      "label": "Heavy Rain",
      "x": 0.0,
      "y": 0.8,
      "reverb": 0.4,
      "individual_audio_url": "/static/outputs/elem_1_abc123.wav"
    }
  ],
  "duration_seconds": 10.0
}
```

### Endpoint 2: `GET /api/status/{job_id}` (Optional but nice)

For progress tracking. Return which elements have finished generating.

---

## Pipeline Steps

### Step 1 — Parallel Sound Generation (ElevenLabs)

Take each element's `sound_prompt` and send it to the ElevenLabs Sound Effects API. Fire all requests concurrently.

```python
import asyncio
import httpx

async def generate_sound(element: dict, client: httpx.AsyncClient) -> bytes:
    response = await client.post(
        "https://api.elevenlabs.io/v1/sound-generation",
        headers={"xi-api-key": ELEVENLABS_API_KEY},
        json={
            "text": element["sound_prompt"],
            "duration_seconds": 10.0,     # standardize duration
            "prompt_influence": 0.3       # keep it grounded
        },
        timeout=60.0
    )
    response.raise_for_status()
    return response.content  # raw audio bytes (mp3)

async def generate_all_sounds(elements: list[dict]) -> list[bytes]:
    async with httpx.AsyncClient() as client:
        tasks = [generate_sound(elem, client) for elem in elements]
        return await asyncio.gather(*tasks)
```

**Important:** ElevenLabs returns MP3 by default. Convert each to WAV via pydub before DSP processing.

### Step 2 — Spatial DSP Mixing

For each element, apply spatial audio processing based on its `(x, y)` coordinates and `reverb` value.

**Coordinate → Audio Mapping:**

| Coordinate | Audio Effect | Formula |
|---|---|---|
| `x` (-1 to 1) | Stereo pan | Direct map: -1 = full left, 0 = center, 1 = full right |
| `y` (0 to 1) | Volume attenuation | `volume_db = -y * 20` (close = loud, far = quiet, max -20dB) |
| `y` (0 to 1) | Low-pass filter | Further away → more high-frequency rolloff. Cutoff: `20000 - (y * 15000)` Hz |
| `reverb` (0 to 1) | Reverb wet/dry | Use pedalboard Reverb with `wet_level=reverb` |

**Mixing with pydub + pedalboard:**

```python
from pydub import AudioSegment
from pedalboard import Pedalboard, Reverb, LowpassFilter
import numpy as np

def apply_spatial(audio_segment: AudioSegment, x: float, y: float, reverb_amount: float) -> AudioSegment:
    # 1. Volume attenuation from distance
    volume_db = -y * 20
    audio = audio_segment + volume_db

    # 2. Convert to numpy for pedalboard processing
    samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
    samples = samples / (2**15)  # normalize to [-1, 1]

    # Reshape for stereo
    if audio.channels == 1:
        samples = np.stack([samples, samples])
    else:
        samples = samples.reshape((-1, 2)).T

    # 3. Apply reverb + low-pass via pedalboard
    board = Pedalboard([
        LowpassFilter(cutoff_frequency_hz=20000 - (y * 15000)),
        Reverb(
            room_size=reverb_amount * 0.8,
            wet_level=reverb_amount * 0.5,
            dry_level=1.0 - reverb_amount * 0.3
        )
    ])
    processed = board(samples, sample_rate=audio.frame_rate)

    # 4. Apply stereo pan
    # x: -1 (left) to 1 (right)
    left_gain = np.sqrt((1 - x) / 2)
    right_gain = np.sqrt((1 + x) / 2)
    processed[0] *= left_gain
    processed[1] *= right_gain

    # 5. Convert back to AudioSegment
    processed = (processed * (2**15)).astype(np.int16)
    processed_interleaved = processed.T.flatten()
    return AudioSegment(
        data=processed_interleaved.tobytes(),
        sample_width=2,
        frame_rate=audio.frame_rate,
        channels=2
    )

def mix_all(elements_audio: list[tuple[AudioSegment, dict]]) -> AudioSegment:
    # Overlay all processed elements
    base = AudioSegment.silent(duration=10000, frame_rate=44100).set_channels(2)
    for audio, metadata in elements_audio:
        processed = apply_spatial(audio, metadata["x"], metadata["y"], metadata["reverb"])
        base = base.overlay(processed)
    return base
```

### Step 3 — Export Individual Tracks

Person 4 (Spatial Editor) needs individual audio tracks, not just the mixed WAV. Save each element's processed audio separately so the frontend can load them into Web Audio API nodes.

```
/static/outputs/
  scene_abc123.wav           # Full spatial mix
  scene_abc123.png           # Generated image
  elem_1_abc123.wav          # Individual: Heavy Rain
  elem_2_abc123.wav          # Individual: Footsteps
  elem_3_abc123.wav          # Individual: Door Slide
```

### Step 4 — Image Generation (Parallel)

Fire image generation concurrently with audio generation to save time.

```python
import replicate

async def generate_image(prompt: str) -> str:
    output = replicate.run(
        "black-forest-labs/flux-1.1-pro",
        input={
            "prompt": f"Atmospheric scene: {prompt}, cinematic lighting, wide angle, moody",
            "aspect_ratio": "16:9",
            "output_format": "png"
        }
    )
    # Download and save the image
    # Return the local file path
    return saved_path
```

Run this as a concurrent task alongside audio generation:
```python
audio_task = asyncio.create_task(generate_all_sounds(elements))
image_task = asyncio.create_task(generate_image(concrete_description))
audio_results, image_path = await asyncio.gather(audio_task, image_task)
```

---

## File Structure

```
backend/
  audio/
    __init__.py
    router.py            # FastAPI router with POST /api/generate
    elevenlabs.py        # ElevenLabs API integration
    spatial_dsp.py       # Spatial mixing (pan, volume, reverb, filter)
    image_gen.py         # FLUX.1 image generation via Replicate
    schemas.py           # Pydantic models
  static/
    outputs/             # Generated files served statically
```

---

## Integration Contract

- **From Person 1:** You receive the `DecomposeResponse` JSON. Call their endpoint or hardcode stubs.
- **To Person 3 (Frontend):** You expose `POST /api/generate` which they call with the decompose output. Return audio URL, image URL, and per-element audio URLs.
- **To Person 4 (Spatial Editor):** You provide individual WAV files per element. They load these into Web Audio API `AudioBufferSourceNode`s for real-time spatial manipulation. **Critical: export individual tracks, not just the mix.**

---

## Testing Without Other People

Hardcode a stub decompose response and test your pipeline end-to-end:

```python
STUB_INPUT = {
    "original_prompt": "rainy Tokyo street at night",
    "concrete_description": "A rainy Tokyo street at night",
    "elements": [
        {"id": "elem_1", "sound_prompt": "heavy rain on pavement, steady, urban", "label": "Rain", "x": 0.0, "y": 0.8, "reverb": 0.4, "layer": "background"},
        {"id": "elem_2", "sound_prompt": "footsteps on wet concrete, slow pace", "label": "Footsteps", "x": -0.3, "y": 0.15, "reverb": 0.1, "layer": "foreground"},
        {"id": "elem_3", "sound_prompt": "distant car passing on wet road", "label": "Car Pass", "x": 0.6, "y": 0.7, "reverb": 0.5, "layer": "background"},
    ]
}
```

Verify:
- All ElevenLabs calls complete without error
- Individual WAV files are saved and playable
- Mixed WAV has audible stereo separation (test with headphones)
- Elements with high y sound quieter and more muffled
- Elements with x=-0.3 come from the left
- Image generates and is saved

---

## Environment Variables Needed

```
ELEVENLABS_API_KEY=your-key-here
REPLICATE_API_TOKEN=your-key-here
```

---

## Dependencies

```
pip install fastapi uvicorn httpx pydub pedalboard numpy replicate
```

Also need `ffmpeg` installed for pydub:
```
# macOS
brew install ffmpeg

# Ubuntu
sudo apt-get install ffmpeg
```
