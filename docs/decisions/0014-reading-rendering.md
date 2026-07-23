# 0014 — Phase 2.3: how case study bodies render

Date: 2026-07-23. Phase 2.3. Author: frontend engineer (Claude).

The problem view renders a case study body that is markdown carrying LaTeX math
and, from Phase 4, `fig://{id}` figure tokens (frontend guide 2). The renderer
is react-markdown with remark-math and rehype-katex, run inside a Server
Component, not a client one. This is the decision that matters: rehype-katex
turns the math into HTML at render time on the server, so the client receives
only the KaTeX stylesheet, never the KaTeX engine, which keeps math off the
content route's initial JavaScript and honours the guide 5 rule that KaTeX loads
in its own weight rather than the bundle (here it loads in none). react-markdown
itself uses no client-only hooks, so it renders server-side cleanly; the four
libraries add nothing to client JS. Figure tokens resolve through a custom image
component that renders next/image at the figure's stored intrinsic dimensions so
nothing shifts on load (guide 2), showing the pixels from the professor's
original and never a redraw or substitute (constraint 2); a token whose pixels
cannot be resolved renders a visible "figure unavailable" marker rather than
vanishing, because a figure is never silently omitted. Ingestion does not exist
yet, so figures are seeded (a map passed to the body), which is exactly how 2.3
proves figure rendering before Phase 4 builds the real source; the signed-URL
resolution and next.config remote patterns land with it. The full-resolution
lightbox on tap (guide 2) is deferred as an interactive enhancement; figures
still render in place at correct size without it.
