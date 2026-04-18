# SoundScene

**Text-to-Spatial Audio Generation**

---

## Overview

SoundScene turns any scene description — concrete or abstract — into a fully spatial, interactive audio environment. Every sound element is individually positioned in 2D space around the listener and draggable in real time. Abstract inputs are grounded through live web search before generation.

---

## The Problem

Generating immersive audio from text is a solved problem at the surface level — ElevenLabs can take "rainy Tokyo street" and return a flat stereo clip. But two problems remain unsolved:

1. **Abstract inputs fail.** "Peace and serenity" sent to a sound generation API produces unpredictable, low-quality output. There is no mechanism to translate emotional or conceptual language into concrete sonic descriptors.
2. **Flat audio lacks presence.** A single stereo blob has no spatial dimension. There is no sense of where sounds are coming from, how far away they are, or how the listener is positioned relative to them.

SoundScene solves both.

---

## Solution

### Abstract → Concrete via Web Search

When a user inputs an abstract concept, SoundScene fires targeted web searches to ground the concept in real-world sonic associations before any audio is generated. "Peace and serenity" becomes "gentle stream", "distant wind chimes", "soft birdsong", "light breeze through leaves" — concrete descriptors that map cleanly to generation APIs.

This is the core multimodal/agentic contribution: the LLM is not relying solely on its own knowledge, but actively retrieving and grounding abstract concepts in real-world associations.

### Spatial Audio with Draggable Elements

Each sound element is individually generated and placed in a 2D space around the listener. Elements can be dragged in real time — move a door from your right to your left, hear it cross. Distance from center controls volume attenuation. Angle controls stereo pan. Reverb is adjustable per element.

---

## Pipeline

### Step 1 — User Input

User provides a text description of a scene. Can be concrete ("rainy Tokyo street at night") or abstract ("peace and serenity").

### Step 2 — Abstract Detection + Web Search

LLM classifies the input as concrete or abstract.

- **If abstract:** fires targeted web searches ("sounds associated with peace", "ambient sounds for serenity"), reads results, extracts concrete sound descriptors
- **If concrete:** skips directly to decomposition

### Step 3 — LLM Decomposition

Claude takes the concrete descriptors and decomposes them into individual sound elements with spatial metadata:

```json
{
  "elements": [
    { "sound": "heavy rain ambience", "x": 0, "y": 0.8, "reverb": 0.4, "layer": "background" },
    { "sound": "footsteps on wet pavement", "x": -0.2, "y": 0.1, "reverb": 0.1, "layer": "foreground" },
    { "sound": "sliding wooden door", "x": 0.8, "y": 0.3, "reverb": 0.5, "layer": "foreground" }
  ]
}
```

### Step 4 — Parallel Sound Generation

Each element is sent as an individual prompt to ElevenLabs Sound Effects API V2. All calls are fired concurrently via `asyncio.gather()` to minimize latency.

### Step 5 — Spatial DSP Mixing

Per element: pan and volume are derived from (x, y) coordinates. Reverb is applied via `pedalboard`. All tracks are layered onto a timeline and exported as a binaural WAV via `pydub`.

### Step 6 — Visual Generation

The original scene description is sent to FLUX.1 via Replicate API in parallel with audio generation, producing a matching image displayed alongside the audio player.

---

## Spatial Editor

Post-generation, users interact with a top-down 2D map with the listener fixed at center.

- Each sound element is a labeled, draggable dot
- Distance from center → volume attenuation
- Angle → stereo pan (left/right)
- Per-element reverb slider in sidebar
- Dragging a dot updates audio in real time via Web Audio API
- Headphone mode toggle

---

## Tech Stack

| Component | Tool |
|---|---|
| Abstract detection + decomposition | Claude (Anthropic API) |
| Web search grounding | Claude + web search tool |
| Sound generation | ElevenLabs Sound Effects API V2 |
| Spatial DSP + mixing | pedalboard + pydub |
| Image generation | FLUX.1 via Replicate |
| Real-time spatial audio | Web Audio API |
| Backend | FastAPI |
| Frontend | React |

---

## Demo Flow

1. Type "peace and serenity" — watch web search fire, concrete descriptors extracted in real time
2. Decomposition JSON appears, parallel generation progress bar runs
3. Image and audio player appear simultaneously (~20 seconds total)
4. Open spatial editor — labeled dots on 2D map
5. Put on headphones, drag the wind chime dot from left to right, hear it move
6. Swap to "rainy Tokyo street" — show it skips web search entirely, faster generation

---

## Why It Wins

- **Genuine novelty.** Nothing like this exists as a unified product.
- **The abstract → concrete translation via web search is a defensible technical contribution**, not just API plumbing.
- **The spatial drag demo is the jaw-drop moment.** Judges put on headphones, drag a sound source, hear it move. Unforgettable.
- **Reliable to demo.** Audio generation is fast and cheap; pre-rendered fallbacks are easy to prepare.
- **Audio is the least explored modality at hackathons.** No competition.
