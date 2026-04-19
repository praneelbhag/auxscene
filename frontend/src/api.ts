import abstractMock from "./mocks/abstractDecomposeResponse.json";
import decomposeMock from "./mocks/decomposeResponse.json";
import generateMock from "./mocks/generateResponse.json";
import type { DecomposeResponse, GenerateResponse, RegenerateElementResponse, SoundElement } from "./types";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
const useMocks = import.meta.env.VITE_USE_MOCKS === "true";

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function postJson<TResponse>(path: string, body: unknown): Promise<TResponse> {
  const requestUrl = `${apiBaseUrl}${path}`;

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(
      `Could not reach the backend at ${requestUrl}. Make sure FastAPI is running on port 8000.`,
      { cause: error },
    );
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<TResponse>;
}

async function postForm<TResponse>(path: string, body: FormData): Promise<TResponse> {
  const requestUrl = `${apiBaseUrl}${path}`;

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: "POST",
      body,
    });
  } catch (error) {
    throw new Error(
      `Could not reach the backend at ${requestUrl}. Make sure FastAPI is running on port 8000.`,
      { cause: error },
    );
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<TResponse>;
}

export async function decomposePrompt(prompt: string): Promise<DecomposeResponse> {
  if (useMocks) {
    await wait(700);
    return prompt.toLowerCase().includes("peace")
      ? (abstractMock as DecomposeResponse)
      : ({ ...(decomposeMock as DecomposeResponse), original_prompt: prompt });
  }

  return postJson<DecomposeResponse>("/api/decompose", { prompt });
}

export async function decomposeImage(
  image: File,
  prompt?: string,
): Promise<DecomposeResponse> {
  if (useMocks) {
    await wait(900);
    return {
      ...(decomposeMock as DecomposeResponse),
      original_prompt: prompt?.trim() || `image input: ${image.name}`,
      concrete_description:
        prompt?.trim() ||
        "A visually analyzed animation frame with ambience, foley details, and spatial sound sources.",
      grounding_sources: [
        "Frame analysis: visible objects, surfaces, foreground/background regions",
        "Sonic vibe: ambience bed, foley details, spatial point sources",
      ],
    };
  }

  const form = new FormData();
  form.append("image", image);
  if (prompt?.trim()) {
    form.append("prompt", prompt.trim());
  }
  return postForm<DecomposeResponse>("/api/decompose-image", form);
}

export async function generateScene(
  decomposeData: DecomposeResponse,
  durationSeconds?: number,
): Promise<GenerateResponse> {
  if (useMocks) {
    await wait(2200);
    const mock = generateMock as GenerateResponse;
    return {
      ...mock,
      duration_seconds: durationSeconds ?? mock.duration_seconds,
      elements: decomposeData.elements.map((element, index) => ({
        ...element,
        individual_audio_url:
          mock.elements[index]?.individual_audio_url ?? mock.audio_url,
      })),
    };
  }

  return postJson<GenerateResponse>("/api/generate", {
    ...decomposeData,
    duration_seconds: durationSeconds,
  });
}

export async function regenerateElement(
  element: SoundElement,
  editInstruction: string,
  context?: Pick<DecomposeResponse, "original_prompt" | "concrete_description">,
): Promise<RegenerateElementResponse> {
  if (useMocks) {
    await wait(900);
    return {
      element: {
        ...element,
        sound_prompt: `${element.sound_prompt ?? element.label}. User refinement: ${editInstruction}`,
        reviewer_notes: [
          ...(element.reviewer_notes ?? []),
          `Mock refinement applied: ${editInstruction}`,
        ],
      },
    };
  }

  return postJson<RegenerateElementResponse>("/api/regenerate-element", {
    element,
    edit_instruction: editInstruction,
    original_prompt: context?.original_prompt,
    concrete_description: context?.concrete_description,
  });
}
