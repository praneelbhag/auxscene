import { FormEvent, useState } from "react";

const examples = ["rainy Tokyo street", "peace and serenity", "busy coffee shop"];

type SceneInputProps = {
  disabled?: boolean;
  onSubmit: (prompt: string) => void;
};

export function SceneInput({ disabled = false, onSubmit }: SceneInputProps) {
  const [prompt, setPrompt] = useState("");

  const submitPrompt = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
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
        <label className="sr-only" htmlFor="scene-prompt">
          Describe a scene
        </label>
        <textarea
          id="scene-prompt"
          value={prompt}
          disabled={disabled}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe a scene..."
          rows={3}
        />
        <button className="primary-action" disabled={disabled || !prompt.trim()}>
          Generate Scene
        </button>
      </form>
      <div className="example-chips" aria-label="Example prompts">
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
