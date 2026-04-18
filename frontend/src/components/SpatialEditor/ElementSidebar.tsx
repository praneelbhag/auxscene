import React from "react";

interface SidebarElement {
  id: string;
  label: string;
  color: string;
  reverb: number;
  volumeOverride: number;
  muted: boolean;
  solo: boolean;
}

interface ElementSidebarProps {
  elements: SidebarElement[];
  onReverbChange: (id: string, value: number) => void;
  onVolumeChange: (id: string, value: number) => void;
  onMuteToggle: (id: string) => void;
  onSoloToggle: (id: string) => void;
  headphoneMode: boolean;
  onHeadphoneToggle: () => void;
}

export function ElementSidebar({
  elements,
  onReverbChange,
  onVolumeChange,
  onMuteToggle,
  onSoloToggle,
  headphoneMode,
  onHeadphoneToggle,
}: ElementSidebarProps) {
  return (
    <div className="element-sidebar">
      {elements.map((el) => (
        <div key={el.id} className={`sidebar-element${el.muted ? " muted" : ""}`}>
          <div className="sidebar-element-header">
            <span className="sidebar-dot" style={{ background: el.color }} />
            <span className="sidebar-label">{el.label}</span>
          </div>

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
              className={`toggle-btn solo-btn${el.solo ? " active" : ""}`}
              onClick={() => onSoloToggle(el.id)}
            >
              Solo
            </button>
            <button
              className={`toggle-btn mute-btn${el.muted ? " active" : ""}`}
              onClick={() => onMuteToggle(el.id)}
            >
              Mute
            </button>
          </div>
        </div>
      ))}

      <button
        className={`headphone-btn${headphoneMode ? " active" : ""}`}
        onClick={onHeadphoneToggle}
      >
        🎧 {headphoneMode ? "Headphone Mode On" : "Headphone Mode"}
      </button>
      {headphoneMode && (
        <p className="headphone-reminder">
          Put on headphones for the full spatial experience!
        </p>
      )}
    </div>
  );
}
