import { useState } from "react";

interface SidebarElement {
  id: string;
  label: string;
  color: string;
  reverb: number;
  volumeOverride: number;
  muted: boolean;
  solo: boolean;
  isPlaying: boolean;
  isRegenerating: boolean;
  sound_prompt?: string;
  mix?: {
    start_seconds?: number;
    gain_db?: number | null;
    density?: string;
    role?: string;
    high_cut_hz?: number | null;
    low_cut_hz?: number | null;
    duck_background?: boolean;
    fade_ms?: number | null;
  };
  cache_hit?: boolean;
  cache_similarity?: number | null;
  reviewer_notes?: string[];
  audio_review?: {
    score?: number | null;
    description?: string | null;
    issues?: string[];
    suggested_prompt?: string | null;
  } | null;
  playback_warning?: string | null;
}

interface ElementSidebarProps {
  elements: SidebarElement[];
  onReverbChange: (id: string, value: number) => void;
  onVolumeChange: (id: string, value: number) => void;
  onMuteToggle: (id: string) => void;
  onSoloToggle: (id: string) => void;
  onPlayToggle: (id: string) => void;
  onRegenerate: (id: string, editInstruction: string) => void;
  headphoneMode: boolean;
  onHeadphoneToggle: () => void;
}

export function ElementSidebar({
  elements,
  onReverbChange,
  onVolumeChange,
  onMuteToggle,
  onSoloToggle,
  onPlayToggle,
  onRegenerate,
  headphoneMode,
  onHeadphoneToggle,
}: ElementSidebarProps) {
  const [edits, setEdits] = useState<Record<string, string>>({});

  return (
    <div className="element-sidebar">
      {elements.map((el) => (
        <div key={el.id} className={`sidebar-element${el.muted ? " muted" : ""}`}>
          <div className="sidebar-element-header">
            <span className="sidebar-dot" style={{ background: el.color }} />
            <span className="sidebar-label">{el.label}</span>
          </div>

          {el.sound_prompt && <p className="sound-prompt-text">{el.sound_prompt}</p>}

          {el.mix && (
            <p className="mix-script-text">
              {el.mix.role ?? "texture"} · {el.mix.density ?? "continuous"} ·{" "}
              {el.mix.gain_db != null ? `${el.mix.gain_db} dB` : "auto gain"}
            </p>
          )}

          <div className="quality-meta">
            {el.cache_hit && (
              <span>
                Cache hit{el.cache_similarity ? ` ${(el.cache_similarity * 100).toFixed(0)}%` : ""}
              </span>
            )}
            {el.audio_review?.score != null && (
              <span>Review {(el.audio_review.score * 100).toFixed(0)}%</span>
            )}
          </div>

          {el.playback_warning ? (
            <p className="playback-warning">{el.playback_warning}</p>
          ) : el.audio_review?.issues?.length ? (
            <p className="review-note">{el.audio_review.issues[0]}</p>
          ) : el.reviewer_notes?.length ? (
            <p className="review-note">{el.reviewer_notes[0]}</p>
          ) : null}

          <label className="slider-label">
            Reverb
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={el.reverb}
              onChange={(e) => onReverbChange(el.id, parseFloat(e.target.value))}
            />
            <span className="slider-value">{el.reverb.toFixed(2)}</span>
          </label>

          <label className="slider-label">
            Vol
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={el.volumeOverride}
              onChange={(e) => onVolumeChange(el.id, parseFloat(e.target.value))}
            />
            <span className="slider-value">{el.volumeOverride.toFixed(2)}</span>
          </label>

          <div className="sidebar-toggles">
            <button
              className={`toggle-btn element-play-btn${el.isPlaying ? " active" : ""}`}
              onClick={() => onPlayToggle(el.id)}
              type="button"
            >
              {el.isPlaying ? "Pause" : "Play"}
            </button>
            <button
              className={`toggle-btn solo-btn${el.solo ? " active" : ""}`}
              onClick={() => onSoloToggle(el.id)}
              type="button"
            >
              Solo
            </button>
            <button
              className={`toggle-btn mute-btn${el.muted ? " active" : ""}`}
              onClick={() => onMuteToggle(el.id)}
              type="button"
            >
              Mute
            </button>
          </div>

          <label className="edit-label">
            Refine
            <textarea
              placeholder="heavier rain, less birds, more distant..."
              value={edits[el.id] ?? ""}
              onChange={(event) =>
                setEdits((current) => ({ ...current, [el.id]: event.target.value }))
              }
            />
          </label>
          <button
            className="regenerate-btn"
            disabled={el.isRegenerating || !(edits[el.id] ?? "").trim()}
            onClick={() => onRegenerate(el.id, (edits[el.id] ?? "").trim())}
            type="button"
          >
            {el.isRegenerating ? "Regenerating..." : "Regenerate Sound"}
          </button>
        </div>
      ))}

      <button
        className={`headphone-btn${headphoneMode ? " active" : ""}`}
        onClick={onHeadphoneToggle}
        type="button"
      >
        {headphoneMode ? "Headphone Mode On" : "Headphone Mode"}
      </button>
      {headphoneMode && (
        <p className="headphone-reminder">
          Put on headphones for the full spatial experience!
        </p>
      )}
    </div>
  );
}
