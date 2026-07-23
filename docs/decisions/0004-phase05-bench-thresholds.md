# 0004 — Phase 0.5: benchmark regression thresholds are absolute budgets

Date: 2026-07-23. Phase 0, milestone 0.5. Author: backend engineer (Claude).

The phases document requires "criterion benchmark regression thresholds" in CI
without naming a mechanism. Criterion's native comparison needs a stored
baseline, and baselines shared across CI runners are notoriously unstable:
runner hardware varies between jobs, so relative comparisons produce false
alarms or, tuned loose enough to avoid them, catch nothing. The gate instead
uses absolute mean-time budgets committed in
`crates/platform_core/bench-thresholds.json`, set at roughly 25 to 30 times the
reference machine's measured means (recorded in the file), which no plausible
runner slowness reaches but any order-of-magnitude regression trips.
`infra/check-bench-thresholds.py` compares criterion's JSON estimates against
the budgets and fails on three conditions: a bench over budget, a budgeted
bench that produced no estimate (renamed or deleted silently), and a bench that
ran without a budget (new public function benched but left ungated). Both
failure directions were proven before commit. Budgets are revised deliberately,
in a reviewed commit, when an intentional change moves a mean; the reference
means in the file's comment are updated at the same time so the margin stays
honest.
