"use client";

// The signature moment (frontend guide 3.3), and the last thing the product
// ships. A client component by necessity: it owns a canvas, a GL context, and a
// frame loop. It is reached only through next/dynamic with ssr: false, so the
// hero is server-rendered, complete, and interactive before a byte of this
// arrives, which is rule 1.
//
// Three ways this never runs, all landing on the same still image, because a
// student's answer to each is identical: reduced motion is asked for, WebGL2 is
// unavailable, or the field fails to build. The canvas stays in layout until
// one of those is certain: hiding it first made IntersectionObserver report it
// off-screen and made createField size a 1x1 buffer. Rule 5's pausing is here:
// an IntersectionObserver on the hero (not the canvas: a z-index -10 box is
// reported off-screen) and a visibilitychange listener for a backgrounded tab.
import { useEffect, useRef, useState } from "react";

import { createField, type Field } from "@/lib/particles/field";
import { ParticleStill } from "./particle-still";

// The ink colour as GL channels. Read from the live token layer so the field
// follows the theme, including a theme that changes under the user's feet.
function inkChannels(element: Element): [number, number, number] {
  const value = getComputedStyle(element).getPropertyValue("--color-ink").trim();
  const hex = value.replace("#", "");
  if (hex.length !== 6) return [0.09, 0.10, 0.14];
  return [
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  ];
}

export function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The still is the first paint (and the fallback): if the field cannot run,
  // the resolved curve is what remains, never an empty box. `live` is the
  // field actually drawing; `fallback` is a committed still, which is the
  // only time the canvas is `hidden`. It must not start hidden: a
  // display:none canvas has no box, so createField reads a 1x1 viewport and
  // IntersectionObserver reports it off-screen and never starts the loop.
  const [fallback, setFallback] = useState(false);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Rule 4, and the one branch that never even creates a context.
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) {
      setFallback(true);
      setLive(false);
      return;
    }

    const field: Field | null = createField(canvas, {
      ink: inkChannels(document.documentElement),
    });
    if (!field) {
      setFallback(true);
      setLive(false);
      return;
    }
    setFallback(false);
    setLive(true);

    // Rule 5: run only while on screen and only while the tab is visible.
    // Observe the hero, not the canvas. The canvas is z-index -10 so it paints
    // behind the copy, and IntersectionObserver treats a negatively stacked
    // box as off-screen, which stopped the loop on the first callback.
    let onScreen = true;
    const sync = () => {
      if (onScreen && document.visibilityState === "visible") field.start();
      else field.stop();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        sync();
      },
      { threshold: 0 },
    );
    observer.observe(canvas.parentElement ?? canvas);
    document.addEventListener("visibilitychange", sync);
    sync();

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      field.destroy();
    };
  }, []);

  return (
    <>
      {/* Behind the content, never in the way of a pointer, and invisible to
          assistive technology: it carries no information. */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 -z-10 h-full w-full ${
          fallback ? "hidden" : ""
        }`}
      />
      {live ? null : <ParticleStill />}
    </>
  );
}
