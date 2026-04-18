import abstractMock from "./mocks/abstractDecomposeResponse.json";
import decomposeMock from "./mocks/decomposeResponse.json";
import generateMock from "./mocks/generateResponse.json";
import type { DecomposeResponse, GenerateResponse } from "./types";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
const useMocks = import.meta.env.VITE_USE_MOCKS === "true";

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function postJson<TResponse>(path: string, body: unknown): Promise<TResponse> {
  const requestUrl = `${apiBaseUrl}${path}`;
  // #region agent log
  fetch("http://127.0.0.1:7919/ingest/f36bc7cd-3af6-4165-9381-ffa5cd4add12", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "ac51e2" },
    body: JSON.stringify({
      sessionId: "ac51e2",
      runId: "pre-fix",
      hypothesisId: "H1",
      location: "frontend/src/api.ts:postJson:beforeFetch",
      message: "About to send POST request",
      data: { path, requestUrl, apiBaseUrl, hasBody: body != null },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const err = error as Error;
    // #region agent log
    fetch("http://127.0.0.1:7919/ingest/f36bc7cd-3af6-4165-9381-ffa5cd4add12", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "ac51e2" },
      body: JSON.stringify({
        sessionId: "ac51e2",
        runId: "pre-fix",
        hypothesisId: "H2",
        location: "frontend/src/api.ts:postJson:fetchError",
        message: "Fetch threw before receiving HTTP response",
        data: { path, requestUrl, errorName: err?.name, errorMessage: err?.message },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw error;
  }
  // #region agent log
  fetch("http://127.0.0.1:7919/ingest/f36bc7cd-3af6-4165-9381-ffa5cd4add12", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "ac51e2" },
    body: JSON.stringify({
      sessionId: "ac51e2",
      runId: "pre-fix",
      hypothesisId: "H3",
      location: "frontend/src/api.ts:postJson:afterFetch",
      message: "Fetch resolved with HTTP response",
      data: { path, requestUrl, status: response.status, ok: response.ok },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<TResponse>;
}

export async function decomposePrompt(prompt: string): Promise<DecomposeResponse> {
  // #region agent log
  fetch("http://127.0.0.1:7919/ingest/f36bc7cd-3af6-4165-9381-ffa5cd4add12", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "ac51e2" },
    body: JSON.stringify({
      sessionId: "ac51e2",
      runId: "pre-fix",
      hypothesisId: "H4",
      location: "frontend/src/api.ts:decomposePrompt:entry",
      message: "decomposePrompt invoked",
      data: { useMocks, promptLength: prompt.length, promptPreview: prompt.slice(0, 40) },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
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
