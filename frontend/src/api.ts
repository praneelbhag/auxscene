import abstractMock from "./mocks/abstractDecomposeResponse.json";
import decomposeMock from "./mocks/decomposeResponse.json";
import generateMock from "./mocks/generateResponse.json";
import type { DecomposeResponse, GenerateResponse } from "./types";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
const useMocks = import.meta.env.VITE_USE_MOCKS === "true";

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function postJson<TResponse>(path: string, body: unknown): Promise<TResponse> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

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

export async function generateScene(
  decomposeData: DecomposeResponse,
): Promise<GenerateResponse> {
  if (useMocks) {
    await wait(2200);
    const mock = generateMock as GenerateResponse;
    return {
      ...mock,
      elements: decomposeData.elements.map((element, index) => ({
        ...element,
        individual_audio_url:
          mock.elements[index]?.individual_audio_url ?? mock.audio_url,
      })),
    };
  }

  return postJson<GenerateResponse>("/api/generate", decomposeData);
}
