import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { decomposeImage, decomposePrompt, generateScene, regenerateElement } from "./api";
import { AuthModal } from "./components/AuthModal";
import { AccountPage } from "./components/AccountPage";
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

const API = "http://localhost:8000/api";

interface AuthUser { id: string; email: string; name: string; }

const statusSteps = ["pending", "generating", "done"] as const;

export default function App() {
  const [phase, setPhase] = useState<AppPhase>("input");
  const [prompt, setPrompt] = useState("");
  const [sceneDurationSeconds, setSceneDurationSeconds] = useState(15);
  const [decomposeData, setDecomposeData] = useState<DecomposeResponse | null>(null);
  const [generateData, setGenerateData] = useState<GenerateResponse | null>(null);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>({});
  const [error, setError] = useState<string | null>(null);

  // Auth state — persisted to localStorage
  const [user, setUser] = useState<AuthUser | null>(() => {
    try { return JSON.parse(localStorage.getItem("ss_user") ?? "null"); } catch { return null; }
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("ss_token"));
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAccount, setShowAccount] = useState(false);

  const handleAuthSuccess = (u: AuthUser, t: string) => {
    setUser(u);
    setToken(t);
    localStorage.setItem("ss_user", JSON.stringify(u));
    localStorage.setItem("ss_token", t);
    setShowAuthModal(false);
  };

  const handleSignOut = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("ss_user");
    localStorage.removeItem("ss_token");
    setShowAccount(false);
  };

  const saveToHistory = async (generated: GenerateResponse, promptText: string) => {
    if (!token) return;
    try {
      await fetch(`${API}/user/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          prompt: promptText,
          audio_url: generated.audio_url,
          image_url: generated.image_url ?? null,
          duration_seconds: generated.duration_seconds ?? null,
        }),
      });
    } catch { /* non-critical */ }
  };

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
      mix: element.mix,
      reviewer_notes: element.reviewer_notes,
      cache_key_hint: element.cache_key_hint,
      cache_hit: element.cache_hit,
      cache_similarity: element.cache_similarity,
      audio_review: element.audio_review,
      playback_warning: element.playback_warning,
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

  const handleAddSound = async (soundPrompt: string): Promise<SpatialElement> => {
    const stubElement: SpatialElement = {
      id: crypto.randomUUID(),
      label: "New Sound",
      x: 0,
      y: 0.5,
      reverb: 0.2,
      individual_audio_url: "",
      sound_prompt: soundPrompt,
    };
    const result = await regenerateElement(stubElement, soundPrompt, decomposeData ?? undefined);
    const newElement = result.element as SpatialElement;

    setGenerateData((current) => {
      if (!current) return current;
      return { ...current, elements: [...current.elements, newElement] };
    });

    return newElement;
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

  const handleSubmit = async (
    nextPrompt: string,
    nextDurationSeconds: number,
    image?: File | null,
  ) => {
    setPrompt(nextPrompt || (image ? `Image: ${image.name}` : ""));
    setSceneDurationSeconds(nextDurationSeconds);
    setError(null);
    setDecomposeData(null);
    setGenerateData(null);
    setGenerationStatus({});
    setPhase("processing");

    try {
      const decomposed = image
        ? await decomposeImage(image, nextPrompt)
        : await decomposePrompt(nextPrompt);
      setDecomposeData(decomposed);
      setGenerationStatus(
        decomposed.elements.reduce<GenerationStatus>((statuses, element) => {
          statuses[element.id] = "pending";
          return statuses;
        }, {}),
      );

      const generated = await generateScene(decomposed, nextDurationSeconds);
      setGenerationStatus(
        decomposed.elements.reduce<GenerationStatus>((statuses, element) => {
          statuses[element.id] = "done";
          return statuses;
        }, {}),
      );
      setGenerateData(generated);
      void saveToHistory(generated, nextPrompt || (image ? `Image: ${image.name}` : ""));
      setPhase("result");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Scene generation failed.");
      setPhase("input");
    }
  };

  const resetScene = () => {
    setPhase("input");
    setPrompt("");
    setSceneDurationSeconds(15);
    setDecomposeData(null);
    setGenerateData(null);
    setGenerationStatus({});
    setError(null);
  };

  if (showAccount && user && token) {
    return (
      <main className="app-shell phase-account">
        <AccountPage
          user={user}
          token={token}
          onSignOut={handleSignOut}
          onBack={() => setShowAccount(false)}
        />
      </main>
    );
  }

  return (
    <main className={appClassName}>
      <div className="ambient-grid" aria-hidden="true" />
      <div className="waveform-accent" aria-hidden="true">
        {Array.from({ length: 28 }).map((_, index) => (
          <span key={index} style={{ "--bar": index } as CSSProperties} />
        ))}
      </div>

      {/* Top-right auth button */}
      <div className="app-topbar">
        {user ? (
          <div className="topbar-user">
            <button className="topbar-name" type="button" onClick={() => setShowAccount(true)}>
              {user.name}
            </button>
          </div>
        ) : (
          <button className="topbar-signin" type="button" onClick={() => setShowAuthModal(true)}>
            Sign In
          </button>
        )}
      </div>

      {showAuthModal && (
        <AuthModal onSuccess={handleAuthSuccess} onClose={() => setShowAuthModal(false)} />
      )}

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
          prompt={`${prompt} - ${sceneDurationSeconds}s`}
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
            sceneDuration={generateData?.duration_seconds ?? 15}
            onRegenerate={handleEditorRegenerate}
            onSave={handleEditorSave}
            onAddSound={handleAddSound}
          />
        </section>
      )}
    </main>
  );
}
