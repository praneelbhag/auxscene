import type { SoundElement } from "../types";
import { ElementList } from "./ElementList";

type SpatialEditorProps = {
  elements: SoundElement[];
  onClose?: () => void;
};

export function SpatialEditor({ elements, onClose }: SpatialEditorProps) {
  return (
    <section className="editor-stage">
      <div className="editor-header">
        <div>
          <p className="eyebrow">Spatial Editor</p>
          <h1>Editor handoff preview</h1>
        </div>
        {onClose && (
          <button className="secondary-action" onClick={onClose} type="button">
            Back to Result
          </button>
        )}
      </div>
      <div className="editor-canvas">
        <div className="listener-dot" aria-label="Listener position" />
        {elements.map((element) => (
          <button
            className="editor-source"
            key={element.id}
            style={{
              left: `${((element.x + 1) / 2) * 100}%`,
              top: `${(1 - element.y) * 100}%`,
            }}
            title={element.label}
            type="button"
          >
            <span>{element.label}</span>
          </button>
        ))}
      </div>
      <ElementList elements={elements} />
    </section>
  );
}
