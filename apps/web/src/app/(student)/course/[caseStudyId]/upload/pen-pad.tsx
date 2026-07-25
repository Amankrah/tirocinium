"use client";

// On-platform pen capture (decision 0042, mode C): a canvas that captures
// stylus, touch, or mouse strokes and exports each page as an ordinary PNG that
// joins the same page list as a photograph, so mode C reduces to mode A. It is
// never the only path (the file modes are the fallback for no pointer), and the
// pad itself has no animation, so reduced motion has nothing to still.
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
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

  function onPointerMove(event: React.PointerEvent) {
    if (!drawing.current) return;
    const g = context();
    if (!g) return;
    const [x, y] = pointAt(event);
    g.lineTo(x, y);
    g.stroke();
    if (!hasInk) setHasInk(true);
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
        className="aspect-[1000/1414] w-full max-w-sm touch-none rounded-md border border-rule-line bg-paper"
      />
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
