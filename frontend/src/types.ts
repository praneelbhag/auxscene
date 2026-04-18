export type Layer = "foreground" | "midground" | "background";

export type SoundElement = {
  id: string;
  sound_prompt?: string;
  label: string;
  x: number;
  y: number;
  reverb: number;
  layer?: Layer;
  generation?: {
    loop?: boolean;
    duration_seconds?: number | null;
    prompt_influence?: number | null;
  };
  reviewer_notes?: string[];
  cache_key_hint?: string | null;
  cache_hit?: boolean;
  cache_similarity?: number | null;
  audio_review?: {
    score?: number | null;
    description?: string | null;
    issues?: string[];
    suggested_prompt?: string | null;
  } | null;
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
  job_id?: string;
  audio_url: string;
  image_url?: string | null;
  elements: SoundElement[];
  duration_seconds?: number;
};

export type RegenerateElementResponse = {
  element: SoundElement;
};

export type GenerationStatus = Record<string, "pending" | "generating" | "done">;

export type AppPhase = "input" | "processing" | "result" | "editor";
