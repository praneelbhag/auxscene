import type { DecomposeResponse, GenerateResponse } from "../types";

// This file is intentionally local and contains no API request. Replace the
// public /demo/rainy-tokyo/*.wav files (and these labels, if needed) to update
// the deployed demo, then run a new frontend build.
export const rainyTokyoDecomposition: DecomposeResponse = {
  original_prompt: "Rainy Tokyo at night",
  is_abstract: false,
  grounding_sources: [],
  concrete_description:
    "A rainy Tokyo street at night: dense rain on wet pavement, footsteps beneath neon signs, distant traffic through puddles, and a soft electrical buzz.",
  elements: [
    {
      id: "rain",
      label: "Heavy Rain",
      sound_prompt: "Steady, close rain falling on a wet Tokyo street at night.",
      x: 0,
      y: 0.45,
      reverb: 0.45,
      layer: "background",
      mix: { role: "bed", density: "continuous", gain_db: -4 },
      individual_audio_url: "/demo/rainy-tokyo/heavy-rain.wav",
    },
    {
      id: "footsteps",
      label: "Footsteps on Wet Pavement",
      sound_prompt: "Occasional footsteps splashing softly on rain-soaked pavement.",
      x: -0.25,
      y: 0.75,
      reverb: 0.3,
      layer: "foreground",
      mix: { role: "detail", density: "occasional", gain_db: -8 },
      individual_audio_url: "/demo/rainy-tokyo/footsteps-wet-pavement.wav",
    },
    {
      id: "passing-car",
      label: "Passing Car",
      sound_prompt: "A distant car passes through a shallow puddle.",
      x: 0.45,
      y: 0.3,
      reverb: 0.55,
      layer: "midground",
      mix: { role: "movement", density: "occasional", gain_db: -10 },
      individual_audio_url: "/demo/rainy-tokyo/passing-car.wav",
    },
    {
      id: "neon-buzz",
      label: "Neon Sign Buzz",
      sound_prompt: "A quiet electrical neon-sign hum under the rain.",
      x: 0.3,
      y: 0.65,
      reverb: 0.2,
      layer: "foreground",
      mix: { role: "texture", density: "continuous", gain_db: -16 },
      individual_audio_url: "/demo/rainy-tokyo/neon-sign-buzz.wav",
    },
    {
      id: "street-ambience",
      label: "Distant Street Ambience",
      sound_prompt: "Faint nighttime city ambience behind the rainfall.",
      x: -0.5,
      y: 0.25,
      reverb: 0.65,
      layer: "background",
      mix: { role: "atmosphere", density: "continuous", gain_db: -14 },
      individual_audio_url: "/demo/rainy-tokyo/distant-street-ambience.wav",
    },
  ],
};

export const rainyTokyoGeneration: GenerateResponse = {
  job_id: "static-rainy-tokyo-demo",
  audio_url: "/demo/rainy-tokyo/mix.wav",
  image_url: null,
  duration_seconds: 15,
  elements: rainyTokyoDecomposition.elements,
};
