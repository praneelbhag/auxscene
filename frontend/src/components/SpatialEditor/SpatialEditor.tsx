import { useCallback, useEffect, useRef, useState } from "react";
import { ElementSidebar } from "./ElementSidebar";
import {
  type AudioNodes,
  resumeAudioContext,
  setupElement,
  teardownElement,
  updateElementPosition,
  updateElementReverb,
  updateElementVolume,
} from "./AudioEngine";
import { SpatialMap } from "./SpatialMap";
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
  x: number;
  y: number;
  reverb: number;
  individual_audio_url: string;
}

interface InternalElement extends SpatialElement {
  color: string;
  muted: boolean;
  solo: boolean;
  volumeOverride: number;
  isPlaying: boolean;
}

interface SpatialEditorProps {
  elements: SpatialElement[];
  onSave?: (elements: SpatialElement[]) => void;
}

function makeInternalElements(elements: SpatialElement[]): InternalElement[] {
  return elements.map((element, index) => ({
    ...element,
    color: COLORS[index % COLORS.length],
    muted: false,
    solo: false,
    volumeOverride: 1,
    isPlaying: false,
  }));
}

function toSpatialElements(elements: InternalElement[]): SpatialElement[] {
  return elements.map(({ color, muted, solo, volumeOverride, isPlaying, ...element }) => element);
}

export default function SpatialEditor({ elements: initialElements, onSave }: SpatialEditorProps) {
  const [elements, setElements] = useState<InternalElement[]>(() =>
    makeInternalElements(initialElements),
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [headphoneMode, setHeadphoneMode] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const audioNodesRef = useRef<Record<string, AudioNodes>>({});
  const elementsRef = useRef(elements);
  const originalPositions = useRef(
    Object.fromEntries(initialElements.map((el) => [el.id, { x: el.x, y: el.y }])),
  );

  const isPlaying = elements.some((element) => element.isPlaying);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

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
    if (audioNodesRef.current[element.id]) return;

    const nodes = await setupElement(element);
    audioNodesRef.current[element.id] = nodes;
    updateElementPosition(nodes, element.x, element.y);
    updateElementReverb(nodes, element.reverb);
  }, []);

  const stopElement = useCallback((id: string) => {
    const nodes = audioNodesRef.current[id];
    if (!nodes) return;

    teardownElement(nodes);
    delete audioNodesRef.current[id];
  }, []);

  const handlePlay = async () => {
    setLoadError(null);
    Object.values(audioNodesRef.current).forEach(teardownElement);
    audioNodesRef.current = {};

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
    Object.values(audioNodesRef.current).forEach(teardownElement);
    audioNodesRef.current = {};
    setElements((current) => current.map((element) => ({ ...element, isPlaying: false })));
  };

  const handleElementPlayToggle = async (id: string) => {
    setLoadError(null);
    const element = elementsRef.current.find((item) => item.id === id);
    if (!element) return;

    if (audioNodesRef.current[id]) {
      stopElement(id);
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
          headphoneMode={headphoneMode}
          onHeadphoneToggle={() => setHeadphoneMode((value) => !value)}
        />
      </div>

      {loadError && <p className="load-error">{loadError}</p>}

      <div className="editor-controls">
        {!isPlaying ? (
          <button className="control-btn play-btn" onClick={handlePlay} type="button">
            Play All
          </button>
        ) : (
          <button className="control-btn pause-btn" onClick={handlePause} type="button">
            Stop All
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
