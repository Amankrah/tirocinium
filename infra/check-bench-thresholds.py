"""Criterion regression gate (Phase 0.5, decision 0004).

Compares each bench's mean estimate against the absolute budgets committed in
crates/platform_core/bench-thresholds.json. Run from crates/platform_core
after `cargo bench -p tirocinium-mastery`:

    python3 ../../infra/check-bench-thresholds.py

Fails if any bench exceeds its budget, if a budgeted bench produced no
estimate (renamed or deleted without updating the budgets), or if a bench ran
that has no budget (new public function benched but left ungated).
"""

import json
import sys
from pathlib import Path

THRESHOLDS = Path("bench-thresholds.json")
CRITERION_DIR = Path("target/criterion")


def mean_ns(bench_id: str) -> float | None:
    estimates = CRITERION_DIR / bench_id / "new" / "estimates.json"
    if not estimates.is_file():
        return None
    mean = json.loads(estimates.read_text(encoding="utf-8"))["mean"]["point_estimate"]
    return float(mean)


def main() -> int:
    budgets = {
        k: float(v)
        for k, v in json.loads(THRESHOLDS.read_text(encoding="utf-8")).items()
        if not k.startswith("_")
    }
    ran = {
        d.name
        for d in CRITERION_DIR.iterdir()
        if (d / "new" / "estimates.json").is_file()
    }

    failures: list[str] = []
    for bench_id, budget in sorted(budgets.items()):
        mean = mean_ns(bench_id)
        if mean is None:
            failures.append(f"{bench_id}: budgeted but produced no estimate")
            continue
        verdict = "over budget" if mean > budget else "ok"
        print(f"{bench_id}: mean {mean:,.0f} ns, budget {budget:,.0f} ns, {verdict}")
        if mean > budget:
            failures.append(f"{bench_id}: {mean:,.0f} ns exceeds {budget:,.0f} ns")

    for unbudgeted in sorted(ran - set(budgets)):
        failures.append(f"{unbudgeted}: ran without a budget; add it to {THRESHOLDS}")

    if failures:
        print("\nbench threshold gate FAILED:", file=sys.stderr)
        for f in failures:
            print(f"  {f}", file=sys.stderr)
        return 1
    print(f"\nbench threshold gate passed: {len(budgets)} benches within budget")
    return 0


if __name__ == "__main__":
    sys.exit(main())
