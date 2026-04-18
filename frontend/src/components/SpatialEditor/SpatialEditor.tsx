import React, { useState, useRef, useEffect, useCallback } from "react";
import { SpatialMap } from "./SpatialMap";
import { ElementSidebar } from "./ElementSidebar";
import {
  AudioNodes,
  setupElement,
  updateElementPosition,
  updateElementReverb,
  updateElementVolume,
  teardownElement,
  resumeAudioContext,
} from "./AudioEngine";
import "./SpatialEditor.css";

const COLORS = [
  "#4f8ef7",
  "#4fc97e",
  "#f7c94f",
  "#f74f6a",
  "#bc4ff7",
  "#4ff7f0",
  "#f79c4f",
];

export interface SpatialElement {
  id: string;
  label: string;
  x: number;   // -1 to 1 (left to right)
  y: number;   // 0 to 1 (close to far)
  reverb: number;
  individual_audio_url: string;
}

interface InternalElement extends SpatialElement {
  color: string;
  muted: boolean;
  solo: boolean;
  volumeOverride: number;
}

interface SpatialEditorProps {
  elements: SpatialElement[];
}

export default function SpatialEditor({ elements: initialElements }: SpatialEditorProps) {
  const [elements, setElements] = useState<InternalElement[]>(() =>
    initialElements.map((el, i) => ({
      ...el,
      color: COLORS[i % COLORS.length],
      muted: false,
      solo: false,
      volumeOverride: 1.0,
    }))
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [headphoneMode, setHeadphoneMode] = useState(false);

  const audioNodesRef = useRef<Record<string, AudioNodes>>({});
  const originalPositions = useRef(
    Object.fromEntries(initialElements.map((el) => [el.id, { x: el.x, y: el.y }]))
  );

  useEffect(() => {
    return () => {
      Object.values(audioNodesRef.current).forEach(teardownElement);
    };
  }, []);

  const handlePlay = async () => {
    resumeAudioContext();
    setLoadError(null);

    // Tear down existing nodes before restarting
    Object.values(audioNodesRef.current).forEach(teardownElement);
    audioNodesRef.current = {};

    const anySolo = elements.some((el) => el.solo);
    const errors: string[] = [];

    for (const el of elements) {
      try {
        const nodes = await setupElement(el);
        // Apply current mute/solo/volume state immediately
        const effective = el.muted ? 0 : anySolo && !el.solo ? 0 : el.volumeOverride;
        nodes.muteGain.gain.value = effective;
        audioNodesRef.current[el.id] = nodes;
      } catch {
        errors.push(el.label);
      }
    }

    if (errors.length > 0) {
      setLoadError(`Could not load audio for: ${errors.join(", ")}`);
    }
    setIsPlaying(true);
  };

  const handlePause = () => {
    Object.values(audioNodesRef.current).forEach(teardownElement);
    audioNodesRef.current = {};
    setIsPlaying(false);
  };

  const handleReset = useCallback(() => {
    setElements((prev) =>
      prev.map((el) => ({
        ...el,
        x: originalPositions.current[el.id]?.x ?? el.x,
        y: originalPositions.current[el.id]?.y ?? el.y,
      }))
    );
    for (const [id, orig] of Object.entries(originalPositions.current)) {
      if (audioNodesRef.current[id]) {
        updateElementPosition(audioNodesRef.current[id], orig.x, orig.y);
      }
    }
  }, []);

  const handleDrag = useCallback((id: string, newX: number, newY: number) => {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, x: newX, y: newY } : el)));
    if (audioNodesRef.current[id]) {
      updateElementPosition(audioNodesRef.current[id], newX, newY);
    }
  }, []);

  const handleReverbChange = (id: string, newReverb: number) => {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, reverb: newReverb } : el)));
    if (audioNodesRef.current[id]) {
      updateElementReverb(audioNodesRef.current[id], newReverb);
    }
  };

  const handleVolumeChange = (id: string, volume: number) => {
    setElements((prev) => {
      const updated = prev.map((el) => (el.id === id ? { ...el, volumeOverride: volume } : el));
      const anySolo = updated.some((el) => el.solo);
      const el = updated.find((e) => e.id === id)!;
      if (audioNodesRef.current[id]) {
        updateElementVolume(audioNodesRef.current[id], volume, el.muted, el.solo, anySolo);
      }
      return updated;
    });
  };

  const handleMuteToggle = (id: string) => {
    setElements((prev) => {
      const updated = prev.map((el) => (el.id === id ? { ...el, muted: !el.muted } : el));
      const anySolo = updated.some((el) => el.solo);
      updated.forEach((el) => {
        if (audioNodesRef.current[el.id]) {
          updateElementVolume(audioNodesRef.current[el.id], el.volumeOverride, el.muted, el.solo, anySolo);
        }
      });
      return updated;
    });
  };

  const handleSoloToggle = (id: string) => {
    setElements((prev) => {
      const updated = prev.map((el) => (el.id === id ? { ...el, solo: !el.solo } : el));
      const anySolo = updated.some((el) => el.solo);
      updated.forEach((el) => {
        if (audioNodesRef.current[el.id]) {
          updateElementVolume(audioNodesRef.current[el.id], el.volumeOverride, el.muted, el.solo, anySolo);
        }
      });
      return updated;
    });
  };

  return (
    <div className="spatial-editor">
      <div className="editor-main">
        <SpatialMap elements={elements} onDrag={handleDrag} />
        <ElementSidebar
          elements={elements}
          onReverbChange={handleReverbChange}
          onVolumeChange={handleVolumeChange}
          onMuteToggle={handleMuteToggle}
          onSoloToggle={handleSoloToggle}
          headphoneMode={headphoneMode}
          onHeadphoneToggle={() => setHeadphoneMode((v) => !v)}
        />
      </div>

      {loadError && <p className="load-error">{loadError}</p>}

      <div className="editor-controls">
        {!isPlaying ? (
          <button className="control-btn play-btn" onClick={handlePlay}>
            ▶ Play All
          </button>
        ) : (
          <button className="control-btn pause-btn" onClick={handlePause}>
            ⏸ Pause
          </button>
        )}
        <button className="control-btn reset-btn" onClick={handleReset}>
          ↺ Reset Positions
        </button>
      </div>
    </div>
  );
}
