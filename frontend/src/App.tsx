import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { decomposePrompt, generateScene } from "./api";
import { ProcessingView } from "./components/ProcessingView";
import { ResultView } from "./components/ResultView";
import { SceneInput } from "./components/SceneInput";
import SpatialEditor, {
  type SpatialElement,
} from "./components/SpatialEditor/SpatialEditor";
import type {
  AppPhase,
  DecomposeResponse,
  GenerateResponse,
  GenerationStatus,
} from "./types";

const statusSteps = ["pending", "generating", "done"] as const;

export default function App() {
  const [phase, setPhase] = useState<AppPhase>("input");
  const [prompt, setPrompt] = useState("");
  const [decomposeData, setDecomposeData] = useState<DecomposeResponse | null>(null);
  const [generateData, setGenerateData] = useState<GenerateResponse | null>(null);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>({});
  const [error, setError] = useState<string | null>(null);

  const appClassName = useMemo(() => `app-shell phase-${phase}`, [phase]);
  const editorElements = useMemo<SpatialElement[]>(() => {
    if (!generateData) return [];

    return generateData.elements.map((element) => ({
      id: element.id,
      label: element.label,
      x: element.x,
      y: element.y,
      reverb: element.reverb,
      individual_audio_url: element.individual_audio_url ?? generateData.audio_url,
    }));
  }, [generateData]);

  useEffect(() => {
    if (!decomposeData || phase !== "processing") return;

    const timers = decomposeData.elements.flatMap((element, index) => [
      window.setTimeout(() => {
        setGenerationStatus((current) => ({
          ...current,
          [element.id]: statusSteps[1],
        }));
      }, 500 + index * 360),
      window.setTimeout(() => {
        setGenerationStatus((current) => ({
          ...current,
          [element.id]: statusSteps[2],
        }));
      }, 1450 + index * 420),
    ]);

    return () => timers.forEach(window.clearTimeout);
  }, [decomposeData, phase]);

  const handleSubmit = async (nextPrompt: string) => {
    // #region agent log
    fetch("http://127.0.0.1:7919/ingest/f36bc7cd-3af6-4165-9381-ffa5cd4add12", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "ac51e2" },
      body: JSON.stringify({
        sessionId: "ac51e2",
        runId: "pre-fix",
        hypothesisId: "H5",
        location: "frontend/src/App.tsx:handleSubmit:entry",
        message: "User submitted prompt",
        data: {
          promptLength: nextPrompt.length,
          promptPreview: nextPrompt.slice(0, 40),
          currentOrigin: window.location.origin,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    setPrompt(nextPrompt);
    setError(null);
    setDecomposeData(null);
    setGenerateData(null);
    setGenerationStatus({});
    setPhase("processing");

    try {
      const decomposed = await decomposePrompt(nextPrompt);
      setDecomposeData(decomposed);
      setGenerationStatus(
        decomposed.elements.reduce<GenerationStatus>((statuses, element) => {
          statuses[element.id] = "pending";
          return statuses;
        }, {}),
      );

      const generated = await generateScene(decomposed);
      setGenerationStatus(
        decomposed.elements.reduce<GenerationStatus>((statuses, element) => {
          statuses[element.id] = "done";
          return statuses;
        }, {}),
      );
      setGenerateData(generated);
      setPhase("result");
    } catch (caught) {
      // #region agent log
      fetch("http://127.0.0.1:7919/ingest/f36bc7cd-3af6-4165-9381-ffa5cd4add12", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "ac51e2" },
        body: JSON.stringify({
          sessionId: "ac51e2",
          runId: "pre-fix",
          hypothesisId: "H5",
          location: "frontend/src/App.tsx:handleSubmit:catch",
          message: "Submission flow failed",
          data: {
            errorType: caught instanceof Error ? caught.name : typeof caught,
            errorMessage:
              caught instanceof Error ? caught.message : "non-Error thrown value",
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      setError(caught instanceof Error ? caught.message : "Scene generation failed.");
      setPhase("input");
    }
  };

  const resetScene = () => {
    setPhase("input");
    setPrompt("");
    setDecomposeData(null);
    setGenerateData(null);
    setGenerationStatus({});
    setError(null);
  };

  return (
    <main className={appClassName}>
      <div className="ambient-grid" aria-hidden="true" />
      <div className="waveform-accent" aria-hidden="true">
        {Array.from({ length: 28 }).map((_, index) => (
          <span key={index} style={{ "--bar": index } as CSSProperties} />
        ))}
      </div>

      {phase === "input" && (
        <>
          <SceneInput onSubmit={handleSubmit} />
          {error && <p className="error-message">{error}</p>}
        </>
      )}

      {phase === "processing" && (
        <ProcessingView
          decomposeData={decomposeData}
          generationStatus={generationStatus}
          prompt={prompt}
        />
      )}

      {phase === "result" && decomposeData && generateData && (
        <ResultView
          decomposeData={decomposeData}
          generateData={generateData}
          onNewScene={resetScene}
          onOpenEditor={() => setPhase("editor")}
        />
      )}

      {phase === "editor" && generateData && (
        <section className="editor-stage">
          <div className="editor-header">
            <div>
              <p className="eyebrow">Spatial Editor</p>
              <h1>Fine tune the mix</h1>
            </div>
            <button
              className="secondary-action"
              onClick={() => setPhase("result")}
              type="button"
            >
              Back to Result
            </button>
          </div>
          <SpatialEditor elements={editorElements} />
        </section>
      )}
    </main>
  );
}
