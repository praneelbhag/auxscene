import React, { useRef } from "react";
import { DraggableDot } from "./DraggableDot";

interface MapElement {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
}

interface SpatialMapProps {
  elements: MapElement[];
  onDrag: (id: string, x: number, y: number) => void;
}

export function SpatialMap({ elements, onDrag }: SpatialMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);

  return (
    <div className="spatial-map" ref={mapRef}>
      {/* Distance rings at 25%, 50%, 75% of max distance */}
      {[0.25, 0.5, 0.75].map((r) => (
        <div
          key={r}
          className="distance-ring"
          style={{ width: `${r * 100}%`, height: `${r * 100}%` }}
        />
      ))}

      {/* Listener fixed at center */}
      <div className="listener-icon">🎧</div>

      {/* Draggable sound elements */}
      {elements.map((el) => (
        <DraggableDot key={el.id} element={el} mapRef={mapRef} onDrag={onDrag} />
      ))}
    </div>
  );
}
