# 0068 — the unfold typesets its steps, figures and all

Date: 2026-08-12. Phase 9.6 (the gap flagged in decision 0066). Author:
frontend engineer (Claude).

The understanding unfold rendered each revealed step as `whitespace-pre-wrap`
plain text, which meant a professor's worked solution showed its own source: a
step carrying `$\frac{Q}{A}$` showed the LaTeX, and a step carrying a `fig://`
token showed the token. Every other surface that renders a professor's markdown
has typeset it since decision 0014, so this was the one place a solution was
displayed as source rather than as writing, and it breaks constraint 2 in the
plainest possible way, by showing a figure's name where the figure should be.
The steps now render through the same `ProblemBody` and `ClientProblemBody` the
reading surfaces use, with figures resolved by decision 0066's resolver over the
revealed steps only. Nothing about the fidelity rule changes and the reason it
held is worth restating: the backend splits the solution deterministically in
Python and never by a model (decision 0049), the split only cuts, and this
surface renders each step exactly as handed over, at the number the server gave
it. Typesetting is a rendering of that text, not a rewriting of it, and the
markdown that goes into the tutor when a student sends a step is still the
source the server sent, never the rendered result, because the tutor and the
student have to be discussing the same step.

The split render is deliberate and follows the practice loop rather than
inventing a second pattern. Steps already revealed when the page loads are
rendered by the Server Component and passed into the client island as nodes, so
the solution is in the HTML, needs no JavaScript to read, and pulls neither
react-markdown nor KaTeX into the route; a step revealed by pressing the button
is rendered by the lazy client twin, whose chunk therefore loads only for a
student who actually asks for another step. The route moves from 110 kB to
116 kB, and the six are next/image's runtime arriving with the figure renderer
rather than the markdown engine, which stays out; against a 170 kB budget on a
reading surface that a student may well have opened on a phone, that is the
right six to spend and the engine is the wrong one. Figures travel with the reveal
for the same reason they travel with a variant swap: the resolve carries the
seat token and belongs on the server, so `revealAction` returns the step payload
and its figures together rather than leaving the island to fetch pixels it has
no credential for.
