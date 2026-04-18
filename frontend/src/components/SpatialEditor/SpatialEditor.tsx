import { useCallback, useEffect, useRef, useState } from "react";
import { ElementSidebar } from "./ElementSidebar";
import {
  type AudioNodes,
  pauseElement,
  playElement,
  resumeAudioContext,
  seekElement,
  setupElement,
  teardownElement,
  updateElementPosition,
  updateElementReverb,
  updateElementVolume,
} from "./AudioEngine";
import { SpatialMap } from "./SpatialMap";
import type { Layer } from "../../types";
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

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remaining}`;
};

export interface SpatialElement {
  id: string;
  label: string;
  x: number;
  y: number;
  reverb: number;
  individual_audio_url: string;
  sound_prompt?: string;
  layer?: Layer;
  generation?: {
    loop?: boolean;
    duration_seconds?: number | null;
    prompt_influence?: number | null;
  };
  reviewer_notes?: string[];
  cache_key_hint?: string | null;
  cache_hit?: boolean;
  cache_similarity?: number | null;
  audio_review?: {
    score?: number | null;
    description?: string | null;
    issues?: string[];
    suggested_prompt?: string | null;
  } | null;
}

interface InternalElement extends SpatialElement {
  color: string;
  muted: boolean;
  solo: boolean;
  volumeOverride: number;
  isPlaying: boolean;
  isRegenerating: boolean;
}

interface SpatialEditorProps {
  elements: SpatialElement[];
  onSave?: (elements: SpatialElement[]) => void;
  onRegenerate?: (element: SpatialElement, editInstruction: string) => Promise<SpatialElement>;
}

function makeInternalElements(elements: SpatialElement[]): InternalElement[] {
  return elements.map((element, index) => ({
    ...element,
    color: COLORS[index % COLORS.length],
    muted: false,
    solo: false,
    volumeOverride: 1,
    isPlaying: false,
    isRegenerating: false,
  }));
}

function toSpatialElements(elements: InternalElement[]): SpatialElement[] {
  return elements.map(({ color, muted, solo, volumeOverride, isPlaying, isRegenerating, ...element }) => element);
}

export default function SpatialEditor({
  elements: initialElements,
  onRegenerate,
  onSave,
}: SpatialEditorProps) {
  const [elements, setElements] = useState<InternalElement[]>(() =>
    makeInternalElements(initialElements),
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [headphoneMode, setHeadphoneMode] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [timelineTime, setTimelineTime] = useState(0);
  const [timelineDuration, setTimelineDuration] = useState(0);

  const audioNodesRef = useRef<Record<string, AudioNodes>>({});
  const elementsRef = useRef(elements);
  const timelineTimeRef = useRef(0);
  const originalPositions = useRef(
    Object.fromEntries(initialElements.map((el) => [el.id, { x: el.x, y: el.y }])),
  );

  const isPlaying = elements.some((element) => element.isPlaying);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  useEffect(() => {
    timelineTimeRef.current = timelineTime;
  }, [timelineTime]);

  useEffect(() => {
    if (!isPlaying) return;

    const timer = window.setInterval(() => {
      const active = elementsRef.current
        .map((element) => audioNodesRef.current[element.id])
        .find((nodes) => nodes && !nodes.audio.paused);

      if (active) {
        setTimelineTime(active.audio.currentTime);
        if (Number.isFinite(active.audio.duration)) {
          setTimelineDuration(active.audio.duration);
        }
      }
    }, 200);

    return () => window.clearInterval(timer);
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      Object.values(audioNodesRef.current).forEach(teardownElement);
      audioNodesRef.current = {};
    };
  }, []);

  const refreshVolumes = useCallback((nextElements: InternalElement[]) => {
    const anySolo = nextElements.some((element) => element.solo);

    nextElements.forEach((element) => {
      const nodes = audioNodesRef.current[element.id];
      if (nodes) {
        updateElementVolume(
          nodes,
          element.volumeOverride,
          element.muted,
          element.solo,
          anySolo,
        );
      }
    });
  }, []);

  const startElement = useCallback(async (element: InternalElement) => {
    await resumeAudioContext();
    let nodes = audioNodesRef.current[element.id];

    if (!nodes) {
      nodes = await setupElement(element);
      audioNodesRef.current[element.id] = nodes;
    }

    if (timelineTimeRef.current > 0) {
      seekElement(nodes, timelineTimeRef.current);
    }

    updateElementPosition(nodes, element.x, element.y);
    updateElementReverb(nodes, element.reverb);
    await playElement(nodes);

    if (Number.isFinite(nodes.audio.duration)) {
      setTimelineDuration(nodes.audio.duration);
    }
  }, []);

  const pauseElementById = useCallback((id: string) => {
    const nodes = audioNodesRef.current[id];
    if (!nodes) return;

    pauseElement(nodes);
  }, []);

  const handlePlay = async () => {
    setLoadError(null);
    const failedIds = new Set<string>();
    const errors: string[] = [];

    for (const element of elementsRef.current) {
      try {
        await startElement(element);
      } catch {
        failedIds.add(element.id);
        errors.push(element.label);
      }
    }

    setElements((current) => {
      const updated = current.map((element) => ({
        ...element,
        isPlaying: !failedIds.has(element.id),
      }));
      refreshVolumes(updated);
      return updated;
    });

    if (errors.length > 0) {
      setLoadError(`Could not load audio for: ${errors.join(", ")}`);
    }
  };

  const handlePause = () => {
    Object.values(audioNodesRef.current).forEach(pauseElement);
    setElements((current) => current.map((element) => ({ ...element, isPlaying: false })));
  };

  const handleElementPlayToggle = async (id: string) => {
    setLoadError(null);
    const element = elementsRef.current.find((item) => item.id === id);
    if (!element) return;

    if (audioNodesRef.current[id] && !audioNodesRef.current[id].audio.paused) {
      pauseElementById(id);
      setElements((current) =>
        current.map((item) => (item.id === id ? { ...item, isPlaying: false } : item)),
      );
      return;
    }

    try {
      await startElement(element);
      setElements((current) => {
        const updated = current.map((item) =>
          item.id === id ? { ...item, isPlaying: true } : item,
        );
        refreshVolumes(updated);
        return updated;
      });
    } catch {
      setLoadError(`Could not load audio for: ${element.label}`);
    }
  };

  const handleReset = useCallback(() => {
    setSaveMessage(null);
    setElements((current) =>
      current.map((element) => {
        const original = originalPositions.current[element.id];
        return original ? { ...element, x: original.x, y: original.y } : element;
      }),
    );

    for (const [id, original] of Object.entries(originalPositions.current)) {
      const nodes = audioNodesRef.current[id];
      if (nodes) {
        updateElementPosition(nodes, original.x, original.y);
      }
    }
  }, []);

  const handleDrag = useCallback((id: string, newX: number, newY: number) => {
    setSaveMessage(null);
    setElements((current) =>
      current.map((element) =>
        element.id === id ? { ...element, x: newX, y: newY } : element,
      ),
    );

    const nodes = audioNodesRef.current[id];
    if (nodes) {
      updateElementPosition(nodes, newX, newY);
    }
  }, []);

  const handleReverbChange = (id: string, newReverb: number) => {
    setSaveMessage(null);
    setElements((current) =>
      current.map((element) =>
        element.id === id ? { ...element, reverb: newReverb } : element,
      ),
    );

    const nodes = audioNodesRef.current[id];
    if (nodes) {
      updateElementReverb(nodes, newReverb);
    }
  };

  const handleVolumeChange = (id: string, volume: number) => {
    setElements((current) => {
      const updated = current.map((element) =>
        element.id === id ? { ...element, volumeOverride: volume } : element,
      );
      refreshVolumes(updated);
      return updated;
    });
  };

  const handleMuteToggle = (id: string) => {
    setElements((current) => {
      const updated = current.map((element) =>
        element.id === id ? { ...element, muted: !element.muted } : element,
      );
      refreshVolumes(updated);
      return updated;
    });
  };

  const handleSoloToggle = (id: string) => {
    setElements((current) => {
      const updated = current.map((element) =>
        element.id === id ? { ...element, solo: !element.solo } : element,
      );
      refreshVolumes(updated);
      return updated;
    });
  };

  const handleSave = () => {
    const saved = toSpatialElements(elementsRef.current);
    onSave?.(saved);
    originalPositions.current = Object.fromEntries(
      saved.map((element) => [element.id, { x: element.x, y: element.y }]),
    );
    setSaveMessage("Mix saved");
  };

  const handleRegenerate = async (id: string, editInstruction: string) => {
    if (!onRegenerate) return;

    const element = elementsRef.current.find((item) => item.id === id);
    if (!element) return;

    setLoadError(null);
    setElements((current) =>
      current.map((item) => (item.id === id ? { ...item, isRegenerating: true } : item)),
    );

    try {
      const nextElement = await onRegenerate(toSpatialElements([element])[0], editInstruction);
      const wasPlaying = Boolean(audioNodesRef.current[id] && !audioNodesRef.current[id].audio.paused);

      if (audioNodesRef.current[id]) {
        teardownElement(audioNodesRef.current[id]);
        delete audioNodesRef.current[id];
      }

      setElements((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                ...nextElement,
                isPlaying: false,
                isRegenerating: false,
              }
            : item,
        ),
      );

      if (wasPlaying) {
        window.setTimeout(() => {
          void handleElementPlayToggle(id);
        }, 0);
      }
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : `Could not regenerate ${element.label}`,
      );
      setElements((current) =>
        current.map((item) => (item.id === id ? { ...item, isRegenerating: false } : item)),
      );
    }
  };

  const handleTimelineChange = (nextTime: number) => {
    setTimelineTime(nextTime);
    timelineTimeRef.current = nextTime;
    Object.values(audioNodesRef.current).forEach((nodes) => seekElement(nodes, nextTime));
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
          onPlayToggle={handleElementPlayToggle}
          onRegenerate={handleRegenerate}
          headphoneMode={headphoneMode}
          onHeadphoneToggle={() => setHeadphoneMode((value) => !value)}
        />
      </div>

      {loadError && <p className="load-error">{loadError}</p>}

      <div className="editor-timeline">
        <input
          aria-label="Editor playback position"
          disabled={!timelineDuration}
          max={timelineDuration || 0}
          min={0}
          onChange={(event) => handleTimelineChange(Number(event.target.value))}
          step={0.01}
          type="range"
          value={Math.min(timelineTime, timelineDuration || 0)}
        />
        <span>
          {formatTime(timelineTime)} / {formatTime(timelineDuration)}
        </span>
      </div>

      <div className="editor-controls">
        {!isPlaying ? (
          <button className="control-btn play-btn" onClick={handlePlay} type="button">
            Play All
          </button>
        ) : (
          <button className="control-btn pause-btn" onClick={handlePause} type="button">
            Pause All
          </button>
        )}
        <button className="control-btn reset-btn" onClick={handleReset} type="button">
          Reset Positions
        </button>
        <button className="control-btn save-btn" onClick={handleSave} type="button">
          Save Mix
        </button>
        {saveMessage && <span className="save-message">{saveMessage}</span>}
      </div>
    </div>
  );
}
