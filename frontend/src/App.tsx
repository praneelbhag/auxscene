import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { decomposePrompt, generateScene, regenerateElement } from "./api";
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
      sound_prompt: element.sound_prompt,
      layer: element.layer,
      generation: element.generation,
      reviewer_notes: element.reviewer_notes,
      cache_key_hint: element.cache_key_hint,
      cache_hit: element.cache_hit,
      cache_similarity: element.cache_similarity,
      audio_review: element.audio_review,
    }));
  }, [generateData]);

  const handleEditorSave = (nextElements: SpatialElement[]) => {
    setGenerateData((current) => {
      if (!current) return current;

      return {
        ...current,
        elements: current.elements.map((element) => {
          const edited = nextElements.find((item) => item.id === element.id);
          return edited
            ? {
                ...element,
                x: edited.x,
                y: edited.y,
                reverb: edited.reverb,
                individual_audio_url: edited.individual_audio_url,
              }
            : element;
        }),
      };
    });
  };

  const handleEditorRegenerate = async (
    element: SpatialElement,
    editInstruction: string,
  ): Promise<SpatialElement> => {
    const regenerated = await regenerateElement(element, editInstruction, decomposeData ?? undefined);
    const nextElement = regenerated.element as SpatialElement;

    setGenerateData((current) => {
      if (!current) return current;

      return {
        ...current,
        elements: current.elements.map((item) =>
          item.id === nextElement.id ? { ...item, ...nextElement } : item,
        ),
      };
    });

    return nextElement;
  };

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
          <SpatialEditor
            elements={editorElements}
            onRegenerate={handleEditorRegenerate}
            onSave={handleEditorSave}
          />
        </section>
      )}
    </main>
  );
}
