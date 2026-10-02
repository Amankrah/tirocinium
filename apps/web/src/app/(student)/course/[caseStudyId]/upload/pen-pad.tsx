"use client";

// On-platform pen capture (decision 0042, mode C; tools in decision 0096).
// Stylus, touch, or mouse strokes export as an ordinary PNG that joins the
// same page list as a photograph. The file modes stay the fallback for anyone
// without a pointer. The pad has no animation.
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  EMPTY_INK,
  ERASER_WIDTH,
  PEN_WIDTH,
  clearInk,
  hasPenInk,
  pushInk,
  redoInk,
  rejectPointer,
  undoInk,
  wantsEraserTip,
  type InkHistory,
  type InkPoint,
  type InkStroke,
  type InkTool,
  type PenWeight,
} from "@/lib/upload/pen-ink";
import { paintSheet, paintStroke } from "@/lib/upload/pen-render";
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
  const inkRef = useRef<InkHistory>(EMPTY_INK);
  const liveRef = useRef<InkStroke | null>(null);
  const penDownRef = useRef(false);
  // How many points of the stroke in progress are already painted. Drawing
  // only what arrived since the last event is what keeps a long page fast:
  // repainting every stroke on every pointermove is work proportional to
  // everything already written, so the pad gets slower the more is on it.
  const paintedRef = useRef(0);
  const toolRef = useRef<InkTool>("pen");
  const weightRef = useRef<PenWeight>("medium");
  const [ink, setInk] = useState<InkHistory>(EMPTY_INK);
  const [tool, setTool] = useState<InkTool>("pen");
  const [weight, setWeight] = useState<PenWeight>("medium");

  toolRef.current = tool;
  weightRef.current = weight;

  // The whole sheet, from the beginning. Only for the moments that genuinely
  // change what is already down: undo, redo, clear, and a cancelled stroke.
  const repaint = useCallback((history: InkHistory) => {
    const g = canvasRef.current?.getContext("2d");
    if (!g) return;
    paintSheet(g, history.strokes, { width: WIDTH, height: HEIGHT });
  }, []);

  // The part of the stroke in progress that is not on the canvas yet.
  const paintLive = useCallback((live: InkStroke) => {
    const g = canvasRef.current?.getContext("2d");
    if (!g) return;
    const from = Math.max(0, paintedRef.current - 1);
    paintStroke(g, live, from);
    paintedRef.current = live.points.length;
  }, []);

  // Committing a finished stroke changes the history, not the pixels: it is
  // already drawn. Repainting here would cost the whole page once per stroke.
  const commit = useCallback((next: InkHistory) => {
    inkRef.current = next;
    setInk(next);
  }, []);

  const restore = useCallback(
    (next: InkHistory) => {
      inkRef.current = next;
      setInk(next);
      repaint(next);
    },
    [repaint],
  );

  useEffect(() => {
    repaint(EMPTY_INK);
  }, [repaint]);

  function pointOf(event: { clientX: number; clientY: number; pressure?: number }): InkPoint {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const pressure = event.pressure ?? 0;
    return {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
      pressure,
    };
  }

  function samples(event: React.PointerEvent): InkPoint[] {
    const native = event.nativeEvent;
    const coalesced =
      typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    const events = coalesced.length > 0 ? coalesced : [native];
    return events.map((sample) => pointOf(sample));
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
    if (next !== box.scrollTop) box.scrollTop = next;
  }

  function onPointerDown(event: React.PointerEvent) {
    if (
      rejectPointer({
        pointerType: event.pointerType,
        width: event.width,
        height: event.height,
        penDown: penDownRef.current,
      })
    ) {
      return;
    }
    if (liveRef.current) return;
    const eraser = toolRef.current === "eraser" || wantsEraserTip(event.button, event.buttons);
    liveRef.current = {
      tool: eraser ? "eraser" : "pen",
      width: eraser ? ERASER_WIDTH : PEN_WIDTH[weightRef.current],
      points: samples(event),
    };
    penDownRef.current = event.pointerType === "pen";
    paintedRef.current = 0;
    canvasRef.current?.setPointerCapture(event.pointerId);
    scrollRef.current?.focus({ preventScroll: true });
    paintLive(liveRef.current);
  }

  function onPointerMove(event: React.PointerEvent) {
    const live = liveRef.current;
    if (!live) return;
    if (
      rejectPointer({
        pointerType: event.pointerType,
        width: event.width,
        height: event.height,
        penDown: penDownRef.current && event.pointerType !== "pen",
      })
    ) {
      return;
    }
    live.points.push(...samples(event));
    paintLive(live);
    follow(event);
  }

  function finishStroke() {
    const live = liveRef.current;
    liveRef.current = null;
    penDownRef.current = false;
    paintedRef.current = 0;
    if (!live) return;
    commit(pushInk(inkRef.current, live));
  }

  // The system cancelled the pointer (a palm, a gesture). The stroke in
  // progress is not ink, so it is dropped and the page is painted again.
  function cancelStroke() {
    liveRef.current = null;
    penDownRef.current = false;
    paintedRef.current = 0;
    repaint(inkRef.current);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key === "z" && !event.shiftKey) {
      event.preventDefault();
      restore(undoInk(inkRef.current));
    } else if ((event.key === "z" && event.shiftKey) || event.key === "y") {
      event.preventDefault();
      restore(redoInk(inkRef.current));
    }
  }

  function addPage() {
    const canvas = canvasRef.current;
    if (!canvas || !hasPenInk(inkRef.current.strokes) || typeof canvas.toBlob !== "function") {
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], `page-${makeId()}.png`, { type: "image/png" }));
      // The ink is now a page in the list. Undo must not bring that page back
      // onto the sheet, or the student would submit it twice.
      restore(EMPTY_INK);
    }, "image/png");
  }

  const inked = hasPenInk(ink.strokes);

  return (
    <div className="flex flex-col gap-3" onKeyDown={onKeyDown}>
      <p className="text-sm text-ink-muted">{s.penHint}</p>
      <div
        role="toolbar"
        aria-label={s.penTools}
        className="flex flex-wrap items-center gap-2"
      >
        <Button
          variant={tool === "pen" ? "primary" : "quiet"}
          aria-pressed={tool === "pen"}
          onClick={() => setTool("pen")}
        >
          {s.pen}
        </Button>
        <Button
          variant={tool === "eraser" ? "primary" : "quiet"}
          aria-pressed={tool === "eraser"}
          onClick={() => setTool("eraser")}
        >
          {s.eraser}
        </Button>
        <div role="radiogroup" aria-label={s.penWeight} className="flex gap-1">
          {(["fine", "medium", "broad"] as const).map((name) => (
            <Button
              key={name}
              variant={weight === name ? "primary" : "quiet"}
              role="radio"
              aria-checked={weight === name}
              onClick={() => setWeight(name)}
            >
              {s.penSizes[name]}
            </Button>
          ))}
        </div>
        <Button
          variant="quiet"
          onClick={() => restore(undoInk(inkRef.current))}
          disabled={ink.past.length === 0}
          aria-keyshortcuts="Control+Z"
        >
          {s.penUndo}
        </Button>
        <Button
          variant="quiet"
          onClick={() => restore(redoInk(inkRef.current))}
          disabled={ink.future.length === 0}
          aria-keyshortcuts="Control+Shift+Z"
        >
          {s.penRedo}
        </Button>
      </div>
      {/* The page is taller than the space, so the student scrolls inside it
          to reach the rest of the sheet (decision 0080). touch-action stays
          none on the canvas itself so a stroke does not scroll mid-line;
          the scrollbar and the wheel move the page, and while a stroke is in
          progress the window follows the pen (decision 0082). Ruled lines are
          a guide drawn over the sheet, not into the exported page. */}
      <div
        ref={scrollRef}
        role="region"
        tabIndex={-1}
        aria-label={s.penScroll}
        className="max-h-[min(32rem,60vh)] w-full overflow-y-scroll overscroll-contain rounded-md border border-field-border bg-white outline-none"
      >
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={WIDTH}
            height={HEIGHT}
            role="img"
            aria-label={s.penCanvas}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishStroke}
            onPointerCancel={cancelStroke}
            className="block aspect-[1000/1414] w-full touch-none bg-white"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to bottom, transparent 0, transparent calc(3.2% - 1px), rgb(22 26 35 / 0.1) calc(3.2% - 1px), rgb(22 26 35 / 0.1) 3.2%)",
            }}
          />
        </div>
      </div>
      <div className="flex gap-3">
        <Button onClick={addPage} disabled={!inked}>
          {s.penAdd}
        </Button>
        <Button variant="quiet" onClick={() => restore(clearInk(inkRef.current))} disabled={!inked}>
          {s.penClear}
        </Button>
      </div>
    </div>
  );
}
