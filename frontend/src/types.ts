export type Layer = "foreground" | "midground" | "background";

export type SoundElement = {
  id: string;
  sound_prompt?: string;
  label: string;
  x: number;
  y: number;
  reverb: number;
  layer?: Layer;
  individual_audio_url?: string;
};

export type DecomposeResponse = {
  original_prompt: string;
  is_abstract: boolean;
  grounding_sources: string[];
  concrete_description: string;
  elements: SoundElement[];
};

export type GenerateResponse = {
  audio_url: string;
  image_url: string;
  elements: SoundElement[];
  duration_seconds?: number;
};

export type GenerationStatus = Record<string, "pending" | "generating" | "done">;

export type AppPhase = "input" | "processing" | "result" | "editor";
