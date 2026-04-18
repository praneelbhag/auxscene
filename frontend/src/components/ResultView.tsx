import type { DecomposeResponse, GenerateResponse } from "../types";
import { AudioPlayer } from "./AudioPlayer";
import { ElementList } from "./ElementList";

type ResultViewProps = {
  decomposeData: DecomposeResponse;
  generateData: GenerateResponse;
  onNewScene: () => void;
  onOpenEditor: () => void;
};

export function ResultView({
  decomposeData,
  generateData,
  onNewScene,
  onOpenEditor,
}: ResultViewProps) {
  const imageUrl = generateData.image_url ?? undefined;
  const hasImage = Boolean(imageUrl);

  return (
    <section className="result-stage">
      <div className="result-hero">
        {hasImage ? (
          <img alt={decomposeData.concrete_description} src={imageUrl} />
        ) : (
          <div aria-hidden="true" className="result-hero-placeholder" />
        )}
        <div className="result-copy">
          <p className="eyebrow">Generated Scene</p>
          <h1>{decomposeData.original_prompt}</h1>
          <p>{decomposeData.concrete_description}</p>
        </div>
      </div>

      <div className="result-controls">
        <AudioPlayer audioUrl={generateData.audio_url} />
        <div className="result-actions">
          <button className="primary-action" onClick={onOpenEditor} type="button">
            Open Spatial Editor
          </button>
          <button className="secondary-action" onClick={onNewScene} type="button">
            New Scene
          </button>
        </div>
      </div>

      <section className="result-elements" aria-labelledby="elements-title">
        <div className="section-heading">
          <p className="eyebrow">Spatial Mix</p>
          <h2 id="elements-title">Sound elements</h2>
        </div>
        <ElementList elements={generateData.elements} />
      </section>
    </section>
  );
}
