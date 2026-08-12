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

export function ParticleHero({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate">
      <ParticleField />
      {children}
    </div>
  );
}
