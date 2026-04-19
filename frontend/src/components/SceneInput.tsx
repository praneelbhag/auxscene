import { FormEvent, useEffect, useRef, useState } from "react";

const examples = ["rainy Tokyo street", "peace and serenity", "busy coffee shop"];

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionErrorEventLike = Event & {
  error: string;
};

type SpeechRecognitionLike = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionConstructor() {
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

type SceneInputProps = {
  disabled?: boolean;
  onSubmit: (prompt: string, durationSeconds: number, image?: File | null) => void;
};

export function SceneInput({ disabled = false, onSubmit }: SceneInputProps) {
  const [prompt, setPrompt] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(15);
  const [image, setImage] = useState<File | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceStatusTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (voiceStatusTimer.current) {
        window.clearTimeout(voiceStatusTimer.current);
      }
      recognitionRef.current?.abort();
    };
  }, []);

  const showVoiceStatus = (message: string, clearAfterMs = 3600) => {
    setVoiceStatus(message);
    if (voiceStatusTimer.current) {
      window.clearTimeout(voiceStatusTimer.current);
    }
    voiceStatusTimer.current = window.setTimeout(() => {
      setVoiceStatus("");
    }, clearAfterMs);
  };

  const submitPrompt = (value: string) => {
    const trimmed = value.trim();
    if ((!trimmed && !image) || disabled) return;
    onSubmit(trimmed, durationSeconds, image);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    recognitionRef.current?.stop();
    submitPrompt(prompt);
  };

  const toggleVoiceInput = () => {
    if (disabled) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      showVoiceStatus("Voice input works best in Chrome or Edge.");
      return;
    }

    const recognition = new Recognition();
    recognitionRef.current = recognition;

    const basePrompt = prompt.trim() ? `${prompt.trim()} ` : "";
    let finalTranscript = "";
    let endedWithError = false;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let interimTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          finalTranscript += `${transcript} `;
        } else {
          interimTranscript += transcript;
        }
      }

      setPrompt(
        `${basePrompt}${finalTranscript}${interimTranscript}`
          .replace(/\s+/g, " ")
          .trimStart(),
      );
    };

    recognition.onerror = (event) => {
      endedWithError = true;
      setIsListening(false);
      const message = event.error === "not-allowed"
        ? "Microphone permission was blocked."
        : "I couldn't hear that clearly. Try again.";
      showVoiceStatus(message);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      if (!endedWithError) {
        if (voiceStatusTimer.current) {
          window.clearTimeout(voiceStatusTimer.current);
        }
        setVoiceStatus("");
      }
    };

    try {
      recognition.start();
      setIsListening(true);
      showVoiceStatus("Listening...", 120000);
    } catch {
      setIsListening(false);
      recognitionRef.current = null;
      showVoiceStatus("Voice input could not start.");
    }
  };

  return (
    <section className="input-stage" aria-labelledby="scene-input-title">
      <div className="sound-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="eyebrow">aux.scene</p>
      <h1 id="scene-input-title">Turn any scene into spatial audio.</h1>
      <p className="hero-sub">Use text, voice, or an image to shape a place, mood, or moment. We'll build the full 3D soundscape.</p>
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
            placeholder="Set the scene or add direction for an uploaded frame..."
            rows={2}
          />
          <div className="prompt-bottom-row">
            <div className="prompt-mode-actions">
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
                    {image ? image.name : "Upload image"}
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
              <button
                className={`voice-input-btn${isListening ? " listening" : ""}`}
                type="button"
                disabled={disabled}
                aria-pressed={isListening}
                aria-label={isListening ? "Stop voice input" : "Start voice input"}
                onClick={toggleVoiceInput}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <path d="M6.5 1.25a2 2 0 0 0-2 2v3a2 2 0 1 0 4 0v-3a2 2 0 0 0-2-2Z" stroke="currentColor" strokeWidth="1.35"/>
                  <path d="M2.75 6.25a3.75 3.75 0 0 0 7.5 0M6.5 10v1.75M4.5 11.75h4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round"/>
                </svg>
                <span>{isListening ? "Listening" : "Speak"}</span>
              </button>
            </div>
          </div>
          {voiceStatus && (
            <p className="voice-status" aria-live="polite">
              {voiceStatus}
            </p>
          )}
        </div>
        <div className="prompt-submit-group">
          <label className="duration-field" htmlFor="scene-duration">
            Length
            <span>
              <input
                id="scene-duration"
                type="number"
                min={1}
                max={180}
                step={1}
                value={durationSeconds}
                disabled={disabled}
                onChange={(event) =>
                  setDurationSeconds(
                    Math.min(180, Math.max(1, Number(event.target.value) || 1)),
                  )
                }
              />
              sec
            </span>
          </label>
          <button className="primary-action" disabled={disabled || (!prompt.trim() && !image)}>
            Generate Scene
          </button>
        </div>
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
