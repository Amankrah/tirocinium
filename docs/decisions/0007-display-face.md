# 0007 — Phase 2.2: the display face is Fraunces (proposal)

Date: 2026-07-23. Phase 2.2 groundwork. Author: frontend engineer (Claude).

The frontend guide (3.2) names Newsreader and Fraunces as candidates for the
characterful display face, "to be refined in design review", and the brand
rules (3.1) ask for a wordmark "set at heavy optical size, in ink on paper".
This proposes Fraunces: it is a variable font whose optical size axis runs to
144 points with weights to black, which is precisely the heavy display setting
the wordmark needs, and its soft, slightly wonky letterforms at display sizes
carry the workbook warmth of the design concept while remaining disciplined at
smaller sizes for in-app headings. Newsreader is the stronger face for long
editorial text, but the interface never sets long text in the display face
(Inter does that work), so the comparison is decided entirely at display
sizes, where Fraunces has more of the personality the brand spends its one
signature moment on. All three families (Fraunces, Inter, JetBrains Mono) ship
through `next/font` as self-hosted woff2 with zero JavaScript bundle cost and
no runtime request to any third party. The reversal cost is one token value
and one import, so if design review prefers Newsreader the swap is minutes,
and this record flips rather than grows.
