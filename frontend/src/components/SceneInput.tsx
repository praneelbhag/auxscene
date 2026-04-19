import { FormEvent, useState } from "react";

const examples = ["rainy Tokyo street", "peace and serenity", "busy coffee shop"];

type SceneInputProps = {
  disabled?: boolean;
  onSubmit: (prompt: string, durationSeconds: number) => void;
};

export function SceneInput({ disabled = false, onSubmit }: SceneInputProps) {
  const [prompt, setPrompt] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(15);

  const submitPrompt = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed, durationSeconds);
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
            placeholder="Describe a scene..."
            rows={2}
          />
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
        <button className="primary-action" disabled={disabled || !prompt.trim()}>
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
