import { type CSSProperties, useMemo, useState } from "react";
import { ResultView } from "./components/ResultView";
import SpatialEditor, {
  type SpatialElement,
} from "./components/SpatialEditor/SpatialEditor";
import {
  rainyTokyoDecomposition,
  rainyTokyoGeneration,
} from "./demo/rainyTokyo";
import type { DecomposeResponse, GenerateResponse } from "./types";

type DemoPhase = "result" | "editor";

const toSpatialElements = (generated: GenerateResponse): SpatialElement[] =>
  generated.elements.map((element) => ({
    id: element.id,
    label: element.label,
    x: element.x,
    y: element.y,
    reverb: element.reverb,
    individual_audio_url: element.individual_audio_url ?? generated.audio_url,
    sound_prompt: element.sound_prompt,
    layer: element.layer,
    generation: element.generation,
    mix: element.mix,
    editor_state: element.editor_state,
  }));

export default function App() {
  const [phase, setPhase] = useState<DemoPhase>("result");
  const [decomposeData, setDecomposeData] = useState<DecomposeResponse>(
    rainyTokyoDecomposition,
  );
  const [generateData, setGenerateData] = useState<GenerateResponse>(
    rainyTokyoGeneration,
  );

  const editorElements = useMemo(
    () => toSpatialElements(generateData),
    [generateData],
  );

  const handleEditorSave = (nextElements: SpatialElement[]) => {
    setGenerateData((current) => ({
      ...current,
      elements: nextElements.map((edited) => {
        const existing = current.elements.find((element) => element.id === edited.id);
        return existing ? { ...existing, ...edited } : edited;
      }),
    }));
    setDecomposeData((current) => ({
      ...current,
      elements: nextElements.map((edited) => {
        const existing = current.elements.find((element) => element.id === edited.id);
        return existing ? { ...existing, ...edited } : edited;
      }),
    }));
  };

  const resetDemo = () => {
    setDecomposeData(rainyTokyoDecomposition);
    setGenerateData(rainyTokyoGeneration);
    setPhase("result");
  };

  return (
    <main className={`app-shell phase-${phase}`}>
      <div className="ambient-grid" aria-hidden="true" />
      <div className="waveform-accent" aria-hidden="true">
        {Array.from({ length: 28 }).map((_, index) => (
          <span key={index} style={{ "--bar": index } as CSSProperties} />
        ))}
      </div>

      <div className="demo-notice" role="status">
        <strong>Demo mode</strong>
        <span>API disconnected · prebuilt audio only</span>
      </div>

      {phase === "result" && (
        <ResultView
          decomposeData={decomposeData}
          generateData={generateData}
          onNewScene={resetDemo}
          onOpenEditor={() => setPhase("editor")}
        />
      )}

      {phase === "editor" && (
        <section className="editor-stage">
          <div className="editor-header">
            <div>
              <p className="eyebrow">Static Demo</p>
              <h1>Explore the Rainy Tokyo mix</h1>
            </div>
            <button
              className="secondary-action"
              onClick={() => setPhase("result")}
              type="button"
            >
              Back to Demo
            </button>
          </div>
          <SpatialEditor
            elements={editorElements}
            sceneDuration={generateData.duration_seconds ?? 15}
            onSave={handleEditorSave}
          />
        </section>
      )}
    </main>
  );
}
