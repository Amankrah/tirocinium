"use client";

// The hero wrapper: the seam that keeps rule 1 true. Everything the particle
// field needs (the canvas, the GL context, the frame loop, the shader source)
// sits behind next/dynamic with ssr: false, so it is a separate chunk fetched
// after the page is complete and interactive, and the hero's own content is
// server-rendered markup that never waits for it.
//
// This wrapper is the only client code on a content route that carries a hero;
// it holds no state and renders its children untouched.
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const ParticleField = dynamic(
  () => import("./particle-field").then((m) => m.ParticleField),
  { ssr: false },
);

// `behind` is the landing: the field fills the hero and the copy sits on it.
// `end` is the course greeting, which is one line of text: the same field sits
// in a box beside that line, so the curve does not cross the letters.
export function ParticleHero({
  align = "behind",
  children,
}: {
  align?: "behind" | "end";
  children: ReactNode;
}) {
  if (align === "end") {
    return (
      <div className="flex items-center gap-6 py-6">
        <div className="min-w-0 flex-1">{children}</div>
        <div className="relative isolate h-24 w-28 shrink-0 overflow-hidden sm:h-28 sm:w-44">
          <ParticleField />
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate">
      <ParticleField />
      {children}
    </div>
  );
}
