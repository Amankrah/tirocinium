"use client";

// The interactive source page: the professor's original page with the detector's
// figure boxes drawn on it (from their normalised bboxes), where selecting a box
// exposes its verbs and dragging an empty region draws a new box to capture a
// figure the detectors missed (frontend guide 4.3). Figures stay pixels from the
// original: this only ever produces a normalised bbox, which the server crops
// from the lossless source. Re-crop (drag handles) needs a server crop endpoint
// that does not exist yet, so adjusting a crop is remove-then-redraw for now.
import { useRef, useState } from "react";

export type Box = {
  figureId: number;
  bbox: [number, number, number, number];
  role: string;
};

// Two points in 0..1 page space to a clamped [x, y, w, h] bbox. Pure, so the
// coordinate maths is unit-tested without a layout.
export function boxFromDrag(
  start: [number, number],
  end: [number, number],
): [number, number, number, number] {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const x0 = clamp(Math.min(start[0], end[0]));
  const y0 = clamp(Math.min(start[1], end[1]));
  const x1 = clamp(Math.max(start[0], end[0]));
  const y1 = clamp(Math.max(start[1], end[1]));
  return [x0, y0, x1 - x0, y1 - y0];
}

// Below this fraction of the page a drag is a mis-click, not a box.
const MIN_BOX = 0.02;

export function PageBoxes({
  imageUrl,
  boxes,
  selectedId,
  onSelect,
  onDraw,
}: {
  imageUrl: string;
  boxes: Box[];
  selectedId: number | null;
  onSelect: (figureId: number | null) => void;
  onDraw: (bbox: [number, number, number, number]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<[number, number] | null>(null);
  const [draft, setDraft] = useState<[number, number, number, number] | null>(null);

  function pointOf(e: React.PointerEvent): [number, number] {
    const rect = ref.current!.getBoundingClientRect();
    return [
      (e.clientX - rect.left) / rect.width,
      (e.clientY - rect.top) / rect.height,
    ];
  }

  return (
    <div
      ref={ref}
      className="relative touch-none select-none overflow-hidden rounded border border-rule-line"
      onPointerDown={(e) => {
        // A press on the page background begins a draw and clears any selection.
        onSelect(null);
        const p = pointOf(e);
        setStart(p);
        setDraft([p[0], p[1], 0, 0]);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (start) setDraft(boxFromDrag(start, pointOf(e)));
      }}
      onPointerUp={(e) => {
        if (start) {
          const box = boxFromDrag(start, pointOf(e));
          if (box[2] >= MIN_BOX && box[3] >= MIN_BOX) onDraw(box);
        }
        setStart(null);
        setDraft(null);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="" className="block h-auto w-full" draggable={false} />
      {boxes.map((b) => {
        const [x, y, w, h] = b.bbox;
        const selected = b.figureId === selectedId;
        return (
          <button
            key={b.figureId}
            type="button"
            aria-label={`Figure ${b.figureId}`}
            aria-pressed={selected}
            onPointerDown={(e) => {
              // Selecting a box must not start a draw on the page beneath it.
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(selected ? null : b.figureId);
            }}
            className={
              "absolute border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
              (selected
                ? "border-accent bg-accent/10"
                : b.role === "decorative"
                  ? "border-rule-line border-dashed"
                  : "border-accent/60")
            }
            style={{
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              width: `${w * 100}%`,
              height: `${h * 100}%`,
            }}
          />
        );
      })}
      {draft && draft[2] > 0 && draft[3] > 0 ? (
        <span
          aria-hidden
          className="absolute border-2 border-dashed border-accent bg-accent/10"
          style={{
            left: `${draft[0] * 100}%`,
            top: `${draft[1] * 100}%`,
            width: `${draft[2] * 100}%`,
            height: `${draft[3] * 100}%`,
          }}
        />
      ) : null}
    </div>
  );
}
