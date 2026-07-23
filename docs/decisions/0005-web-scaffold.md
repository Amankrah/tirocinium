# 0005 — Phase 0.5 (web half): the apps/web scaffold and its CI job

Date: 2026-07-23. Phase 0, milestone 0.5, landed after backend 1.1. Author:
frontend engineer (Claude).

The phases document placed the Next.js scaffold in 0.1 and the web CI job in
0.5, but both waited on the frontend engineer; this lands them now, closing
Phase 0's last open stub without touching the contract seam (the committed
`schema.ts` and `generate:client` script are byte-identical). The scaffold is
Next.js 15 App Router with TypeScript strict, Tailwind v4 over a token layer in
`src/styles/tokens.css` carrying the guide 3.2 palette verbatim (pinned by a
Vitest token-contract test), the three route groups of guide section 7, and a
server-rendered landing placeholder whose copy lives in a typed strings module
from day one. Three judgement calls worth recording. First, the display face
stays unresolved: the guide itself marks Newsreader and Fraunces as candidates
"to be refined in design review", so `--font-display` falls back to a system
serif stack and no font dependency (and no bundle cost) ships until the Phase
2.2 design pass records that choice. Second, `next-env.d.ts` is gitignored and
CI runs `tsc` after `next build`, because Next 15.5 stamps the file with a
reference into the generated `.next/types`, which does not exist on a fresh
checkout; this matches current create-next-app defaults. Third, Lighthouse,
axe, and Playwright are deliberately absent from the new web job: the phases
document wires them at the Phase 2 gate, when the routes they measure exist,
and a budget check against a placeholder page would be a green light that
proves nothing. The build's baseline is recorded here for that future gate:
the landing route is fully static at 103 kB First Load JS uncompressed, far
inside the 170 kB gzipped budget.
