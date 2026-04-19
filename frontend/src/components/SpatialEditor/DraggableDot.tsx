import React, { useState } from "react";

interface DotElement {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
}

interface DraggableDotProps {
  element: DotElement;
  mapRef: React.RefObject<HTMLDivElement>;
  onDrag: (id: string, x: number, y: number) => void;
  ghost?: boolean;
}

export function DraggableDot({ element, mapRef, onDrag, ghost = false }: DraggableDotProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = (e.clientY - rect.top) / rect.height;
    onDrag(element.id, Math.max(-1, Math.min(1, x)), Math.max(0, Math.min(1, y)));
  };

  const handlePointerUp = () => setIsDragging(false);

  return (
    <div
      className={`draggable-dot${isDragging ? " dragging" : ""}${ghost ? " ghost-dot" : ""}`}
      style={{
        left: `${((element.x + 1) / 2) * 100}%`,
        top: `${element.y * 100}%`,
        background: ghost ? "transparent" : element.color,
        border: ghost ? `2px dashed ${element.color}` : "none",
        opacity: ghost ? 0.65 : 1,
        boxShadow: isDragging
          ? `0 0 18px 7px ${element.color}99`
          : ghost ? "none" : `0 0 8px 3px ${element.color}66`,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {!ghost && <span className="dot-label">{element.label}</span>}
    </div>
  );
}
