import { FormEvent, useState } from "react";

const examples = ["rainy Tokyo street", "peace and serenity", "busy coffee shop"];

type SceneInputProps = {
  disabled?: boolean;
  onSubmit: (prompt: string, durationSeconds: number, image?: File | null) => void;
};

export function SceneInput({ disabled = false, onSubmit }: SceneInputProps) {
  const [prompt, setPrompt] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(15);
  const [image, setImage] = useState<File | null>(null);

  const submitPrompt = (value: string) => {
    const trimmed = value.trim();
    if ((!trimmed && !image) || disabled) return;
    onSubmit(trimmed, durationSeconds, image);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitPrompt(prompt);
  };

  return (
    <section className="input-stage" aria-labelledby="scene-input-title">
      <div className="sound-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="eyebrow">SoundScene</p>
      <h1 id="scene-input-title">Turn any scene into spatial audio.</h1>
      <p className="hero-sub">Describe a place, mood, or moment — we'll build the full 3D soundscape.</p>
      <form className="prompt-form" onSubmit={handleSubmit}>
        <div className="prompt-fields">
          <label className="sr-only" htmlFor="scene-prompt">
            Describe a scene
          </label>
          <textarea
            id="scene-prompt"
            value={prompt}
            disabled={disabled}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe a scene or add direction for an uploaded frame..."
            rows={2}
          />
          <div className="prompt-bottom-row">
            <div className="image-upload-wrap">
              <label className="image-field" htmlFor="scene-image">
                <input
                  id="scene-image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={disabled}
                  onChange={(event) => setImage(event.target.files?.[0] ?? null)}
                />
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <path d="M6.5 1v8M3 4l3.5-3.5L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M1 10.5h11V12H1z" fill="currentColor" opacity="0.4"/>
                </svg>
                <span className="image-field-text">
                  {image ? image.name : "Add image"}
                </span>
              </label>
              {image && (
                <button
                  className="image-clear-btn"
                  type="button"
                  aria-label="Remove image"
                  onClick={() => setImage(null)}
                >
                  ×
                </button>
              )}
            </div>
            <label className="duration-field" htmlFor="scene-duration">
              Length
              <span>
                <input
                  id="scene-duration"
                  type="number"
                  min={1}
                  max={30}
                  step={1}
                  value={durationSeconds}
                  disabled={disabled}
                  onChange={(event) =>
                    setDurationSeconds(
                      Math.min(30, Math.max(1, Number(event.target.value) || 1)),
                    )
                  }
                />
                sec
              </span>
            </label>
          </div>
        </div>
        <button className="primary-action" disabled={disabled || (!prompt.trim() && !image)}>
          Generate Scene
        </button>
      </form>
      <div className="example-chips" aria-label="Example prompts">
        <span className="example-chips-label">Try:</span>
        {examples.map((example) => (
          <button
            className="chip"
            disabled={disabled}
            key={example}
            onClick={() => submitPrompt(example)}
            type="button"
          >
            {example}
          </button>
        ))}
      </div>
    </section>
  );
}
