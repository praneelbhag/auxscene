import type { CSSProperties } from "react";
import type { SoundElement } from "../types";

type ElementListProps = {
  animated?: boolean;
  elements: SoundElement[];
};

const formatPosition = (value: number) => (value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2));

export function ElementList({ animated = false, elements }: ElementListProps) {
  return (
    <div className="element-list">
      {elements.map((element, index) => (
        <article
          className={`element-item ${animated ? "element-item-animated" : ""}`}
          key={element.id}
          style={{ "--delay": `${index * 120}ms` } as CSSProperties}
        >
          <div className="element-spatial-map" aria-hidden="true">
            <span
              style={{
                left: `${((element.x + 1) / 2) * 100}%`,
                top: `${(1 - element.y) * 100}%`,
              }}
            />
          </div>
          <div>
            <h3>{element.label}</h3>
            <p>{element.sound_prompt ?? element.layer ?? "Spatial audio layer"}</p>
            {element.playback_warning && (
              <p className="element-warning">{element.playback_warning}</p>
            )}
          </div>
          <dl>
            <div>
              <dt>X</dt>
              <dd>{formatPosition(element.x)}</dd>
            </div>
            <div>
              <dt>Y</dt>
              <dd>{element.y.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Verb</dt>
              <dd>{Math.round(element.reverb * 100)}%</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}
