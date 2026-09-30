"use client";

// On-platform pen capture (decision 0042, mode C): a canvas that captures
// stylus, touch, or mouse strokes and exports each page as an ordinary PNG that
// joins the same page list as a photograph, so mode C reduces to mode A. It is
// never the only path (the file modes are the fallback for no pointer), and the
// pad itself has no animation, so reduced motion has nothing to still.
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { followPen } from "@/lib/upload/pen-scroll";
import { strings } from "../../../strings";

// A portrait page ratio; the canvas scales responsively but exports at this size.
const WIDTH = 1000;
const HEIGHT = 1414;

const s = strings.upload;

export function PenPad({
  onCapture,
  makeId = () => crypto.randomUUID(),
}: {
  onCapture: (file: File) => void;
  makeId?: () => string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  function context(): CanvasRenderingContext2D | null {
    return canvasRef.current?.getContext("2d") ?? null;
  }

  // Fresh page: white ground and the ink style. Also the reset for "clear".
  const reset = useCallback(() => {
    const g = canvasRef.current?.getContext("2d") ?? null;
    if (!g) return;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, WIDTH, HEIGHT);
    g.strokeStyle = "#161a23";
    g.lineWidth = 3;
    g.lineCap = "round";
    g.lineJoin = "round";
    setHasInk(false);
  }, []);

  useEffect(() => {
    reset();
  }, [reset]);

  function pointAt(event: React.PointerEvent): [number, number] {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) / rect.width) * WIDTH,
      ((event.clientY - rect.top) / rect.height) * HEIGHT,
    ];
  }

  function onPointerDown(event: React.PointerEvent) {
    const g = context();
    if (!g) return;
    drawing.current = true;
    const [x, y] = pointAt(event);
    g.beginPath();
    g.moveTo(x, y);
    canvasRef.current?.setPointerCapture(event.pointerId);
  }

  // Keep the window under the pen (decision 0082). Only while drawing, so a
  // student who scrolls to re-read what they wrote is never dragged back.
  function follow(event: React.PointerEvent) {
    const box = scrollRef.current;
    if (!box) return;
    const next = followPen({
      pointerY: event.clientY - box.getBoundingClientRect().top,
      scrollTop: box.scrollTop,
      clientHeight: box.clientHeight,
      scrollHeight: box.scrollHeight,
    });
    // Comparing first keeps the common case (pen in the middle of the window)
    // from writing to the DOM on every single pointer move.
    if (next !== box.scrollTop) box.scrollTop = next;
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!drawing.current) return;
    const g = context();
    if (!g) return;
    const [x, y] = pointAt(event);
    g.lineTo(x, y);
    g.stroke();
    if (!hasInk) setHasInk(true);
    follow(event);
  }

  function onPointerUp() {
    drawing.current = false;
  }

  function addPage() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk || typeof canvas.toBlob !== "function") return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], `page-${makeId()}.png`, { type: "image/png" }));
      reset();
    }, "image/png");
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">{s.penHint}</p>
      {/* The page is taller than the space, so the student scrolls inside it
          to reach the rest of the sheet (decision 0080). touch-action stays
          none on the canvas itself so a stroke does not scroll mid-line;
          the scrollbar and the wheel move the page, and while a stroke is in
          progress the window follows the pen (decision 0082) so writing does
          not have to stop at the fold. The height is capped against the
          viewport as well as in rem, so a short screen shows a usable window
          instead of one taller than the screen it sits on. */}
      <div
        ref={scrollRef}
        role="region"
        aria-label={s.penScroll}
        className="max-h-[min(32rem,60vh)] w-full overflow-y-scroll overscroll-contain rounded-md border border-field-border bg-white"
      >
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          role="img"
          aria-label={s.penCanvas}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          className="block aspect-[1000/1414] w-full touch-none bg-paper"
        />
      </div>
      <div className="flex gap-3">
        <Button onClick={addPage} disabled={!hasInk}>
          {s.penAdd}
        </Button>
        <Button variant="quiet" onClick={reset} disabled={!hasInk}>
          {s.penClear}
        </Button>
      </div>
    </div>
  );
}
