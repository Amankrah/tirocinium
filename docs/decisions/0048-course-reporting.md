# 0048: course reporting, and prices the platform refuses to invent

Milestone 8.3 asks for activity by seat number, token and cost per course, the
two product-health dashboards, and defence-rubric agreement against grades. All
four are lenses over rows the pipelines already write, so they land as one
read-only professor-and-owner module (`app/reports/`) with no new table and no
migration: activity joins the directory's roster to the shard's submission and
conversation counts in Python, usage aggregates `token_usage` and
`speech_usage`, health reads per-page confidences and variant verification
states, and the calibration report pairs each closed conversation's validated
rubric with the grade on its submission. Two shapes needed deciding because the
guides are silent on them. First, cost: the guides say "token and cost per
course" but name no prices, and a price is an operator fact that changes without
notice, so none is hard-coded. Rates come from `TIRO_MODEL_PRICES` and
`TIRO_SPEECH_PRICES`, and with nothing configured the report carries real usage
with every cost null and `priced: false`, because a made-up number in a
cost report is worse than no number. Second, the agreement statistic: the
mastery specification asks for the rubric's agreement with professor judgment to
be tracked per course but does not fix a measure, so the report gives the mean
rubric score (per-concept reasoning on the 0..3 anchors, averaged and
normalised), the mean grade, the mean signed difference (positive means the
tutor read more generously, which is the drift the anchored prompt resists), the
mean absolute difference, and Pearson's r. Every one of those is null rather
than fabricated when there is nothing to compute it from: no pairs, a single
pair, or a series with no variance. The same restraint governs the pass rate,
which is null rather than zero for a course whose variants were never machine
verified. Activity is ordered by seat number and never by volume, because
mastery spec section 6 rules out a per-seat ranking lens and a report sorted by
who did most is exactly that lens wearing a different hat.
