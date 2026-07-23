# 0022 — The LCP budget is a warning, not a blocker, for now

Date: 2026-07-23. Phase 3, wiring the Phase 2 to 3 CI gate. Author: frontend
engineer (Claude), with the human lead's sign-off.

**Lighthouse's `largest-contentful-paint` assertion becomes `warn` while
accessibility, total-blocking-time, and script size stay `error`, so the CI
gate enforces the three budgets that pass today rather than blocking every build
on the one that does not.** The frontend guide's section 5 targets LCP under
1.8 s on simulated mid-range mobile, and the shipped content routes come in at
about 2.2 s under Lighthouse's lantern model. That number is real and
reproduces in CI, but it is not a page defect: observed (unthrottled) LCP is
about 50 ms, and the simulated figure is dominated by the Next 15 and React 19
framework baseline JS plus one render-blocking stylesheet on the simulated
Slow-4G critical path, not by anything the page renders. Preloading the display
font and switching it to `font-display: optional` were both tried and measured
and moved LCP by nothing, which is what identified the framework JS, not the
font, as the cause. This is a genuine tension inside the guide, between the
1.8 s budget and the framework the same guide specifies, and per CLAUDE.md a
gate conflict is flagged out loud rather than silently resolved: the budget is
not being deleted or quietly loosened, it stays recorded at 1.8 s and still
reports, it simply does not fail the build while the cause is a baseline cost we
have not yet reduced. The accessibility budget is a hard product floor (WCAG 2.2
AA) and stays blocking, as do TBT and the 170 kB script budget, all of which
pass. The tracked follow-up is to bring LCP under 1.8 s honestly (inline the
critical CSS and trim the baseline JS on content routes) or, if that proves
impossible for a route that carries the specified display face and framework, to
raise the conflict with the guide owner and recalibrate the number deliberately.
This decision is revisited when the particle hero ships last (build order item
6), since that gate requires every budget green everywhere, and a warning is not
green.
