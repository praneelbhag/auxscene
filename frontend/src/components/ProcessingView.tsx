import type { CSSProperties } from "react";
import type { DecomposeResponse, GenerationStatus, SoundElement } from "../types";
import { ElementList } from "./ElementList";

type ProcessingViewProps = {
  decomposeData: DecomposeResponse | null;
  generationStatus: GenerationStatus;
  prompt: string;
};

export function ProcessingView({
  decomposeData,
  generationStatus,
  prompt,
}: ProcessingViewProps) {
  const elements = decomposeData?.elements ?? [];
  const generationItems: Array<SoundElement | null> = elements.length
    ? elements
    : Array.from({ length: 4 }, () => null);

  return (
    <section className="processing-stage" aria-live="polite">
      <div className="processing-header">
        <p className="eyebrow">Building soundscape</p>
        <h1>{prompt}</h1>
      </div>

      <div className="pipeline-grid">
        <div className="pipeline-panel classification-panel">
          <span className="status-badge">
            {decomposeData
              ? decomposeData.is_abstract
                ? "Abstract input detected - searching for sounds..."
                : "Concrete input - decomposing scene..."
              : "Listening to prompt..."}
          </span>
          <p>
            {decomposeData?.concrete_description ??
              "Classifying intent, scene density, and spatial cues."}
          </p>
        </div>

        <div className="pipeline-panel elements-panel">
          <div className="panel-heading">
            <span>Scene Elements</span>
            <i />
          </div>
          {elements.length > 0 ? (
            <ElementList animated elements={elements} />
          ) : (
            <div className="element-skeletons">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton-block" style={{ "--i": i } as CSSProperties}>
                  <span className="skeleton-label">Analyzing scene…</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pipeline-panel progress-panel">
          <div className="panel-heading">
            <span>Generation</span>
            <i />
          </div>
          <div className="generation-list">
            {generationItems.map((element, index) => {
              const status = element ? generationStatus[element.id] ?? "pending" : "pending";
              return (
                <div className={`generation-row is-${status}`} key={element?.id ?? index}>
                  <div>
                    <span>{element?.label ?? "Queued layer"}</span>
                    <small>{status}</small>
                  </div>
                  <div className="mini-progress">
                    <span />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="image-skeleton" aria-label="Generated image loading">
          <div className="image-skeleton-wave" />
          <span className="image-skeleton-label">Generating scene image…</span>
        </div>
      </div>
    </section>
  );
}
