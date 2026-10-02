"use client";

// On-platform pen capture (decision 0042, mode C; tools in decisions 0096
// and 0097: the highlighter, the straight edge, the lasso, and zoom).
// Stylus, touch, or mouse strokes export as an ordinary PNG that joins the
// same page list as a photograph. The file modes stay the fallback for anyone
// without a pointer. The pad has no animation.
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  EMPTY_INK,
  ERASER_WIDTH,
  HIGHLIGHTER_WIDTH,
  PEN_WIDTH,
  clearInk,
  hasPenInk,
  pushInk,
  redoInk,
  rejectPointer,
  removeStrokes,
  replaceInk,
  translateStrokes,
  undoInk,
  wantsEraserTip,
  type InkHistory,
  type InkPoint,
  type InkStroke,
  type InkTool,
  type MarkTool,
  type PenWeight,
} from "@/lib/upload/pen-ink";
import { paintLasso, paintSelection, paintSheet, paintStroke } from "@/lib/upload/pen-render";
import { selectionBounds, strokesInLasso, withinBounds } from "@/lib/upload/pen-select";
import { followPen } from "@/lib/upload/pen-scroll";
import { strings } from "../../../strings";

// A portrait page ratio; the canvas scales responsively but exports at this size.
const WIDTH = 1000;
const HEIGHT = 1414;

const s = strings.upload;

// Zoom is why a student can write a subscript on a phone. The ink is stored in
// page coordinates and the pointer is read through the canvas's own box, so
// magnifying is purely a matter of how wide the canvas is drawn: nothing in
// the model knows about it.
const ZOOM_STEPS = [1, 1.5, 2, 3] as const;

const TOOLS: { name: InkTool; label: string }[] = [
  { name: "pen", label: s.pen },
  { name: "highlighter", label: s.highlighter },
  { name: "straight", label: s.straight },
  { name: "eraser", label: s.eraser },
  { name: "lasso", label: s.lasso },
];

function toolWidth(tool: MarkTool, weight: PenWeight): number {
  if (tool === "eraser") return ERASER_WIDTH;
  if (tool === "highlighter") return HIGHLIGHTER_WIDTH;
  return PEN_WIDTH[weight];
}

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
  const [zoom, setZoom] = useState(1);
  const [chosen, setChosen] = useState<ReadonlySet<number>>(new Set());
  // The loop being drawn, and the drag that moves what it caught. Refs rather
  // than state: they change on every pointer sample, and re-rendering the
  // toolbar sixty times a second to move a dashed box would be absurd.
  const lassoRef = useRef<InkPoint[] | null>(null);
  const chosenRef = useRef<ReadonlySet<number>>(new Set());
  const dragRef = useRef<InkPoint | null>(null);
  // The page as it was before a drag began, so the whole move undoes in one
  // step rather than in however many pointer samples it happened to take.
  const historyBeforeDragRef = useRef<InkHistory | null>(null);

  toolRef.current = tool;
  weightRef.current = weight;
  chosenRef.current = chosen;

  // The whole sheet, from the beginning. Only for the moments that genuinely
  // change what is already down: undo, redo, clear, and a cancelled stroke.
  const repaint = useCallback(
    (history: InkHistory, held: ReadonlySet<number> = chosenRef.current) => {
      const g = canvasRef.current?.getContext("2d");
      if (!g) return;
      paintSheet(g, history.strokes, { width: WIDTH, height: HEIGHT });
      paintSelection(g, selectionBounds(history.strokes, held));
      if (lassoRef.current) paintLasso(g, lassoRef.current);
    },
    [],
  );

  /** Give up the selection: any edit invalidates the indices it holds. */
  const release = useCallback(() => {
    chosenRef.current = new Set();
    setChosen(new Set());
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
    if (liveRef.current || lassoRef.current || dragRef.current) return;
    canvasRef.current?.setPointerCapture(event.pointerId);
    scrollRef.current?.focus({ preventScroll: true });
    penDownRef.current = event.pointerType === "pen";

    if (toolRef.current === "lasso") {
      const start = pointOf(event);
      const bounds = selectionBounds(inkRef.current.strokes, chosenRef.current);
      // Landing on what is already held means "move this", not "start again".
      // Circling a selection to pick it up a second time is the kind of step
      // that makes a tool feel like it is arguing with you.
      if (bounds && withinBounds(start, bounds)) {
        dragRef.current = start;
        historyBeforeDragRef.current = inkRef.current;
        return;
      }
      lassoRef.current = [start];
      release();
      repaint(inkRef.current, new Set());
      return;
    }

    const eraser = toolRef.current === "eraser" || wantsEraserTip(event.button, event.buttons);
    const marker: MarkTool = eraser ? "eraser" : (toolRef.current as MarkTool);
    liveRef.current = {
      tool: marker,
      width: toolWidth(marker, weightRef.current),
      points: samples(event),
    };
    paintedRef.current = 0;
    paintLive(liveRef.current);
  }

  function onPointerMove(event: React.PointerEvent) {
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

    const drag = dragRef.current;
    if (drag) {
      const now = pointOf(event);
      const moved = translateStrokes(
        inkRef.current.strokes,
        chosenRef.current,
        now.x - drag.x,
        now.y - drag.y,
      );
      dragRef.current = now;
      // Not committed to history yet: the whole move is one undo, so the
      // history entry is written once when the pointer lifts.
      inkRef.current = { ...inkRef.current, strokes: moved };
      repaint(inkRef.current);
      follow(event);
      return;
    }

    const loop = lassoRef.current;
    if (loop) {
      loop.push(pointOf(event));
      repaint(inkRef.current, new Set());
      follow(event);
      return;
    }

    const live = liveRef.current;
    if (!live) return;
    if (live.tool === "straight") {
      // A ruled line is its two ends. Keeping only those means the preview
      // follows the pointer instead of recording the wobble on the way.
      const first = live.points[0];
      if (first) live.points = [first, pointOf(event)];
      repaint(inkRef.current);
      const g = canvasRef.current?.getContext("2d");
      if (g) paintStroke(g, live);
      follow(event);
      return;
    }
    live.points.push(...samples(event));
    paintLive(live);
    follow(event);
  }

  function finishStroke() {
    const drag = dragRef.current;
    if (drag) {
      dragRef.current = null;
      penDownRef.current = false;
      // One history entry for the whole drag, from where the strokes were
      // before it started.
      commit(replaceInk(historyBeforeDragRef.current ?? inkRef.current, inkRef.current.strokes));
      historyBeforeDragRef.current = null;
      return;
    }

    const loop = lassoRef.current;
    if (loop) {
      lassoRef.current = null;
      penDownRef.current = false;
      const caught = strokesInLasso(inkRef.current.strokes, loop);
      chosenRef.current = caught;
      setChosen(caught);
      repaint(inkRef.current, caught);
      return;
    }

    const live = liveRef.current;
    liveRef.current = null;
    penDownRef.current = false;
    paintedRef.current = 0;
    if (!live) return;
    commit(pushInk(inkRef.current, live));
  }

  // Every edit renumbers the strokes, so the selection cannot survive one: it
  // holds indices, and the stroke at index 4 after an undo is not the stroke
  // the student circled.
  function undoStep() {
    release();
    restore(undoInk(inkRef.current));
  }

  function redoStep() {
    release();
    restore(redoInk(inkRef.current));
  }

  function clearSheet() {
    release();
    restore(clearInk(inkRef.current));
  }

  function deleteSelection() {
    if (chosenRef.current.size === 0) return;
    const kept = removeStrokes(inkRef.current.strokes, chosenRef.current);
    release();
    restore(replaceInk(inkRef.current, kept));
  }

  // The system cancelled the pointer (a palm, a gesture). The stroke in
  // progress is not ink, so it is dropped and the page is painted again.
  function cancelStroke() {
    liveRef.current = null;
    lassoRef.current = null;
    dragRef.current = null;
    historyBeforeDragRef.current = null;
    penDownRef.current = false;
    paintedRef.current = 0;
    repaint(inkRef.current);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      chosenRef.current.size > 0
    ) {
      event.preventDefault();
      deleteSelection();
      return;
    }
    if (event.key === "Escape" && chosenRef.current.size > 0) {
      event.preventDefault();
      release();
      repaint(inkRef.current, new Set());
      return;
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key === "z" && !event.shiftKey) {
      event.preventDefault();
      undoStep();
    } else if ((event.key === "z" && event.shiftKey) || event.key === "y") {
      event.preventDefault();
      redoStep();
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
      release();
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
        {TOOLS.map(({ name, label }) => (
          <Button
            key={name}
            variant={tool === name ? "primary" : "quiet"}
            aria-pressed={tool === name}
            onClick={() => {
              setTool(name);
              if (name !== "lasso") {
                release();
                repaint(inkRef.current, new Set());
              }
            }}
          >
            {label}
          </Button>
        ))}
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
          onClick={undoStep}
          disabled={ink.past.length === 0}
          aria-keyshortcuts="Control+Z"
        >
          {s.penUndo}
        </Button>
        <Button
          variant="quiet"
          onClick={redoStep}
          disabled={ink.future.length === 0}
          aria-keyshortcuts="Control+Shift+Z"
        >
          {s.penRedo}
        </Button>
        {/* Zoom is what makes a subscript writable on a phone. The ink is kept
            in page coordinates and the pointer is read through the canvas's
            own box, so magnifying is only a question of how wide the canvas is
            drawn: undo, export and the selection all carry on unchanged. */}
        <div className="flex items-center gap-1" aria-label={s.penZoom} role="group">
          <Button
            variant="quiet"
            onClick={() => setZoom((z) => ZOOM_STEPS[Math.max(0, ZOOM_STEPS.indexOf(z as 1) - 1)] ?? 1)}
            disabled={zoom === ZOOM_STEPS[0]}
            aria-label={s.penZoomOut}
          >
            &minus;
          </Button>
          <span className="font-mono text-sm tabular-nums text-ink-muted">
            {s.penZoomLevel(zoom)}
          </span>
          <Button
            variant="quiet"
            onClick={() =>
              setZoom(
                (z) =>
                  ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, ZOOM_STEPS.indexOf(z as 1) + 1)] ?? z,
              )
            }
            disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]}
            aria-label={s.penZoomIn}
          >
            +
          </Button>
        </div>
        {chosen.size > 0 ? (
          <Button variant="quiet" onClick={deleteSelection} aria-keyshortcuts="Delete">
            {s.penDelete}
          </Button>
        ) : null}
      </div>
      {tool === "lasso" ? (
        <p className="text-sm text-ink-muted">
          {chosen.size > 0 ? s.penMove : s.lassoHint}
        </p>
      ) : null}
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
        className="max-h-[min(32rem,60vh)] w-full overflow-auto overscroll-contain rounded-md border border-field-border bg-white outline-none"
      >
        <div className="relative" style={{ width: `${zoom * 100}%` }}>
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
        <Button variant="quiet" onClick={clearSheet} disabled={!inked}>
          {s.penClear}
        </Button>
      </div>
    </div>
  );
}
