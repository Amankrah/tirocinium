# 0066 — the fig:// resolver, made real on every reading surface

Date: 2026-08-12. Phase 9.6 (a defect against constraint 2). Author: frontend
engineer (Claude).

Decision 0014 built the figure branch of `ProblemBody` against a seeded map and
deferred "the signed-URL resolution and next.config remote patterns" to Phase 4,
and Phase 4 never came back for it: no call site in `apps/web` has ever passed a
`figures` prop, so every `fig://` token on every reading surface has been taking
the unresolved branch and rendering the amber "Figure unavailable" marker while
the professor's pixels sit in storage and resolve fine at the API. Journey four
found it on the professor's preview of a confirmed draft, which is the worst
place to find it (guide 4.3: diagrams are where a professor decides whether the
platform respects their material), but it was never only that surface: the
student's problem view, the practice swap, the three preview variants, and the
flagged comparison all render bodies that carry figure tokens, because
generation preserves the token multiset by a fidelity check (decision 0038).
So the fix is the resolver itself, not a prop on one page. It lives in
`lib/api/figures.ts` and is server-side only: `figureIdsIn` is a pure scan of
the markdown for `fig://{id}`, and `resolveFigures` resolves each distinct id
once, in parallel, through `GET /courses/{id}/figures/{figure_id}` (decision
0032), returning the `FigureMap` the renderer already takes. Authorization stays
the backend's and is not restated on the client: that one endpoint answers a
professor-owner for any figure in the course and a seat only for a figure a
published case study carries, so a seat surface cannot resolve what it may not
see. A figure that does not resolve is simply absent from the map and keeps the
amber marker, because a figure is never silently omitted.

The one genuinely open question was how the pixels reach the page, and it is a
three-way pull. Guide 5 says images go through `next/image` exclusively; guide 2
says the resolver serves the 2x rendition on high-density screens and uses the
stored intrinsic dimensions so nothing shifts; constraint 2 says a figure is
never re-encoded lossily. Next's default loader satisfies the first and breaks
the third, because `/_next/image` re-encodes to WebP or AVIF at widths of its
choosing, which would mean the diagram a student sees is Next's re-encode of the
professor's original rather than the original. Figures therefore render through
`next/image` with a per-figure custom loader that returns the backend's own URLs
(`image_url`, and `image_url_2x` once the requested width exceeds the intrinsic
width). That is still `next/image`, so the layout and `srcSet` behaviour the
guides ask for is unchanged and the 2x rendition arrives exactly where guide 2
wants it; the optimizer is never entered, so the bytes on the wire are the bytes
in storage; and no `remotePatterns` entry is needed, which is why that half of
0014's deferral simply disappears rather than landing. The backend already
produced both renditions at ingestion, so Next had nothing to add here but a
re-encode. The cost is one extra server-side request per distinct figure per
render, issued in parallel and skipped entirely for a body with no tokens.
One surface is knowingly still short and is recorded rather than left quiet: the
understanding unfold renders each solution step as pre-wrapped plain text with no
markdown renderer at all, so a step carrying a figure token shows the token and a
step carrying LaTeX shows the LaTeX. That is a wider gap than figures and wants
its own slice.
