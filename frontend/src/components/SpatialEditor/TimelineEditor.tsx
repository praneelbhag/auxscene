import { useRef, useCallback } from "react";
import type React from "react";

export interface TimelineClip {
  id: string;
  label: string;
  color: string;
  clipStart: number;
  clipEnd: number;
  automationEnabled?: boolean;
  autoStart: number;
  autoEnd: number;
}

type DragState =
  | null
  | { type: "move";       id: string; startMx: number; startClipStart: number; clipDuration: number }
  | { type: "resize";     id: string; startMx: number; startClipEnd: number;   minEnd: number }
  | { type: "auto-start"; id: string; startMx: number; startAutoStart: number; clipStart: number; autoEnd: number }
  | { type: "auto-end";   id: string; startMx: number; startAutoEnd: number;   clipEnd: number;   autoStart: number };

interface TimelineEditorProps {
  clips: TimelineClip[];
  duration: number;
  playheadTime: number;
  onClipChange: (id: string, changes: Partial<Pick<TimelineClip, "clipStart" | "clipEnd" | "autoStart" | "autoEnd">>) => void;
  onSeek: (time: number) => void;
}

export function TimelineEditor({ clips, duration, playheadTime, onClipChange, onSeek }: TimelineEditorProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>(null);

  const pxToTime = useCallback((clientX: number): number => {
    if (!trackRef.current || duration <= 0) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration));
  }, [duration]);

  const dtFromDx = useCallback((dx: number): number => {
    if (!trackRef.current || duration <= 0) return 0;
    return (dx / trackRef.current.getBoundingClientRect().width) * duration;
  }, [duration]);

  const pct = (t: number) => duration > 0 ? `${(t / duration) * 100}%` : "0%";

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest(".tl-clip")) return;
    onSeek(pxToTime(e.clientX));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dt = dtFromDx(e.clientX - drag.startMx);

    if (drag.type === "move") {
      const newStart = Math.max(0, Math.min(duration - drag.clipDuration, drag.startClipStart + dt));
      onClipChange(drag.id, { clipStart: newStart, clipEnd: newStart + drag.clipDuration });
    } else if (drag.type === "resize") {
      onClipChange(drag.id, { clipEnd: Math.max(drag.minEnd, Math.min(duration, drag.startClipEnd + dt)) });
    } else if (drag.type === "auto-start") {
      const newAs = Math.max(drag.clipStart, Math.min(drag.autoEnd - 0.5, drag.startAutoStart + dt));
      onClipChange(drag.id, { autoStart: newAs });
    } else if (drag.type === "auto-end") {
      const newAe = Math.max(drag.autoStart + 0.5, Math.min(drag.clipEnd, drag.startAutoEnd + dt));
      onClipChange(drag.id, { autoEnd: newAe });
    }
  };

  const handlePointerUp = () => { dragRef.current = null; };

  const step = duration > 20 ? 5 : duration > 10 ? 3 : 2;
  const marks: number[] = [];
  for (let t = 0; t <= duration + 0.01; t += step) marks.push(Math.min(t, duration));

  return (
    <div className="tl-editor">
      <div className="tl-label-col">
        <div className="tl-ruler-spacer" />
        {clips.map((clip) => (
          <div key={clip.id} className="tl-row-label">
            <span className="tl-dot" style={{ background: clip.color }} />
            <span>{clip.label}</span>
          </div>
        ))}
        <div className="tl-legend">
          <span className="tl-legend-auto">▐ Path</span>
        </div>
      </div>

      <div className="tl-main">
        <div className="tl-ruler">
          {marks.map((t) => (
            <div key={t} className="tl-mark" style={{ left: pct(t) }}>
              <span>{t}s</span>
            </div>
          ))}
        </div>

        <div
          className="tl-tracks"
          ref={trackRef}
          onPointerDown={handleTrackPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {marks.map((t) => (
            <div key={t} className="tl-gridline" style={{ left: pct(t) }} />
          ))}

          <div className="tl-playhead" style={{ left: pct(Math.min(playheadTime, duration)) }} />

          {clips.map((clip) => {
            const clipDur = clip.clipEnd - clip.clipStart;
            if (clipDur <= 0) return null;

            const asRel     = ((clip.autoStart - clip.clipStart) / clipDur) * 100;
            const aeRel     = ((clip.autoEnd   - clip.clipStart) / clipDur) * 100;
            const autoWidth = Math.max(0, aeRel - asRel);

            return (
              <div key={clip.id} className="tl-row">
                <div
                  className="tl-clip"
                  style={{ left: pct(clip.clipStart), width: pct(clipDur), "--cc": clip.color } as React.CSSProperties}
                  onPointerDown={(e) => {
                    if ((e.target as Element).closest(".tl-handle, .tl-auto-handle")) return;
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    dragRef.current = { type: "move", id: clip.id, startMx: e.clientX, startClipStart: clip.clipStart, clipDuration: clipDur };
                  }}
                >
                  {/* Automation range band */}
                  {clip.automationEnabled && (
                    <div
                      className="tl-auto-band"
                      style={{ left: `${asRel}%`, width: `${autoWidth}%` }}
                    />
                  )}

                  <span className="tl-clip-label">{clip.label}</span>

                  {/* Automation range handles */}
                  {clip.automationEnabled && (
                    <>
                      <div
                        className="tl-auto-handle tl-auto-start"
                        style={{ left: `${asRel}%` }}
                        title={`Path start: ${clip.autoStart.toFixed(1)}s`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.currentTarget.setPointerCapture(e.pointerId);
                          dragRef.current = { type: "auto-start", id: clip.id, startMx: e.clientX, startAutoStart: clip.autoStart, clipStart: clip.clipStart, autoEnd: clip.autoEnd };
                        }}
                      />
                      <div
                        className="tl-auto-handle tl-auto-end"
                        style={{ left: `${aeRel}%` }}
                        title={`Path end: ${clip.autoEnd.toFixed(1)}s`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.currentTarget.setPointerCapture(e.pointerId);
                          dragRef.current = { type: "auto-end", id: clip.id, startMx: e.clientX, startAutoEnd: clip.autoEnd, clipEnd: clip.clipEnd, autoStart: clip.autoStart };
                        }}
                      />
                    </>
                  )}

                  {/* Right-edge resize */}
                  <div
                    className="tl-handle tl-resize-handle"
                    title="Drag to trim end"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      dragRef.current = { type: "resize", id: clip.id, startMx: e.clientX, startClipEnd: clip.clipEnd, minEnd: clip.clipStart + 0.5 };
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
