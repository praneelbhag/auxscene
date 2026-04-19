import React, { useRef } from "react";
import { DraggableDot } from "./DraggableDot";

interface MapElement {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
  automationEnabled?: boolean;
  endX?: number;
  endY?: number;
}

interface SpatialMapProps {
  elements: MapElement[];
  onDrag: (id: string, x: number, y: number) => void;
  onAutomationDrag?: (id: string, x: number, y: number) => void;
}

export function SpatialMap({ elements, onDrag, onAutomationDrag }: SpatialMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);

  const toLeft = (x: number) => `${((x + 1) / 2) * 100}%`;
  const toTop = (y: number) => `${y * 100}%`;

  return (
    <div className="spatial-map" ref={mapRef}>
      {[0.25, 0.5, 0.75].map((r) => (
        <div
          key={r}
          className="distance-ring"
          style={{ width: `${r * 100}%`, height: `${r * 100}%` }}
        />
      ))}

      <span className="dir-label dir-front">↑ Front</span>
      <span className="dir-label dir-back">↓ Back</span>
      <span className="dir-label dir-left">← Left</span>
      <span className="dir-label dir-right">Right →</span>

      <div className="listener-icon">🎧</div>

      {/* Automation paths — SVG lines + ghost dots */}
      <svg className="automation-svg" aria-hidden="true">
        {elements.filter((el) => el.automationEnabled && el.endX !== undefined).map((el) => (
          <line
            key={el.id}
            x1={toLeft(el.x)} y1={toTop(el.y)}
            x2={toLeft(el.endX!)} y2={toTop(el.endY ?? el.y)}
            stroke={el.color}
            strokeWidth="1.5"
            strokeDasharray="5 4"
            opacity="0.5"
          />
        ))}
      </svg>

      {elements.filter((el) => el.automationEnabled && el.endX !== undefined).map((el) => (
        <DraggableDot
          key={`auto-${el.id}`}
          element={{ id: el.id, label: "→ end", x: el.endX!, y: el.endY ?? el.y, color: el.color }}
          mapRef={mapRef}
          onDrag={onAutomationDrag ?? (() => {})}
          ghost
        />
      ))}

      {elements.map((el) => (
        <DraggableDot key={el.id} element={el} mapRef={mapRef} onDrag={onDrag} />
      ))}
    </div>
  );
}
