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
  automationEnabled?: boolean;
  fadeEnabled?: boolean;
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
  playback_warning?: string | null;
}

interface ElementSidebarProps {
  elements: SidebarElement[];
  onReverbChange: (id: string, value: number) => void;
  onVolumeChange: (id: string, value: number) => void;
  onMuteToggle: (id: string) => void;
  onSoloToggle: (id: string) => void;
  onPlayToggle: (id: string) => void;
  onRegenerate?: (id: string, editInstruction: string) => void;
  onAutomationToggle: (id: string) => void;
  onFadeToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onAddSound?: (prompt: string) => Promise<void>;
  isAdding?: boolean;
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
  onAutomationToggle,
  onFadeToggle,
  onDelete,
  onAddSound,
  isAdding,
  headphoneMode,
  onHeadphoneToggle,
}: ElementSidebarProps) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [addPrompt, setAddPrompt] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="element-sidebar">
      {elements.map((el) => (
        <div key={el.id} className={`sidebar-element${el.muted ? " muted" : ""}`}>
          <div className="sidebar-element-header">
            <span className="sidebar-dot" style={{ background: el.color }} />
            <span className="sidebar-label">{el.label}</span>
            <div className="sidebar-header-right">
              {el.mix && (
                <span className="sidebar-role">{el.mix.role ?? "texture"}</span>
              )}
              <button
                className="delete-sound-btn"
                type="button"
                title="Remove sound"
                onClick={() => onDelete(el.id)}
              >
                ×
              </button>
            </div>
          </div>

          {el.sound_prompt && (
            <p className="sound-prompt-text">{el.sound_prompt}</p>
          )}

          <div className="vsliders-row">
            <div className="vslider-group">
              <span className="vslider-value">{el.reverb.toFixed(2)}</span>
              <input
                type="range"
                className="vslider"
                min={0}
                max={1}
                step={0.01}
                value={el.reverb}
                onChange={(e) => onReverbChange(el.id, parseFloat(e.target.value))}
                aria-label="Reverb"
              />
              <span className="vslider-name">Reverb</span>
            </div>
            <div className="vslider-group">
              <span className="vslider-value">{el.volumeOverride.toFixed(2)}</span>
              <input
                type="range"
                className="vslider"
                min={0}
                max={1}
                step={0.01}
                value={el.volumeOverride}
                onChange={(e) => onVolumeChange(el.id, parseFloat(e.target.value))}
                aria-label="Volume"
              />
              <span className="vslider-name">Vol</span>
            </div>
          </div>

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

          <div className="sidebar-actions">
            <button
              className={`toggle-btn automation-btn${el.automationEnabled ? " active" : ""}`}
              type="button"
              title="Animate spatial position over time"
              onClick={() => onAutomationToggle(el.id)}
            >
              {el.automationEnabled ? "Path On" : "Animate"}
            </button>
            <button
              className={`toggle-btn fade-btn${el.fadeEnabled ? " active" : ""}`}
              type="button"
              title="Apply 1s fade in and fade out"
              onClick={() => onFadeToggle(el.id)}
            >
              Fade
            </button>
            {onRegenerate && (
              <button
                className="refine-toggle"
                type="button"
                onClick={() => setExpanded((s) => ({ ...s, [el.id]: !s[el.id] }))}
              >
                {expanded[el.id] ? "▲ Refine" : "▼ Refine"}
              </button>
            )}
          </div>

          {onRegenerate && expanded[el.id] && (
            <>
              <label className="edit-label">
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
            </>
          )}
        </div>
      ))}

      {onAddSound && (
        <div className="add-sound-section">
          {showAddForm ? (
            <div className="add-sound-form">
              <input
                className="add-sound-input"
                type="text"
                placeholder="Describe a new sound..."
                value={addPrompt}
                onChange={(e) => setAddPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && addPrompt.trim() && !isAdding) {
                    void onAddSound(addPrompt.trim()).then(() => {
                      setAddPrompt("");
                      setShowAddForm(false);
                    });
                  } else if (e.key === "Escape") {
                    setShowAddForm(false);
                    setAddPrompt("");
                  }
                }}
                autoFocus
              />
              <div className="add-sound-form-actions">
                <button
                  className="add-sound-submit-btn"
                  type="button"
                  disabled={!addPrompt.trim() || isAdding}
                  onClick={() => {
                    void onAddSound(addPrompt.trim()).then(() => {
                      setAddPrompt("");
                      setShowAddForm(false);
                    });
                  }}
                >
                  {isAdding ? "Generating..." : "Generate"}
                </button>
                <button
                  className="add-sound-cancel-btn"
                  type="button"
                  onClick={() => { setShowAddForm(false); setAddPrompt(""); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="add-sound-btn"
              type="button"
              onClick={() => setShowAddForm(true)}
            >
              + Add Sound
            </button>
          )}
        </div>
      )}

      <button
        className={`headphone-btn${headphoneMode ? " active" : ""}`}
        onClick={onHeadphoneToggle}
        type="button"
      >
        {headphoneMode ? "Headphones Recommended" : "Headphones Recommended"}
      </button>
      {headphoneMode && (
        <p className="headphone-reminder">
          Put on headphones for the full spatial experience!
        </p>
      )}
    </div>
  );
}
