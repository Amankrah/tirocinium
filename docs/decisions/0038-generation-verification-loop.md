# 0038: The verification re-solve sees the question only, and every failure flags

Milestone 5.3 implements guide 6.3 with three recorded choices. First, the
independent re-solve receives the variant's question and its essential figures
as images, and nothing else: guide 6.3's "receives the variant and solution
without the first pass's reasoning" is ambiguous about whether the generated
solution travels, and the stronger reading is chosen because agreement is
decided programmatically by the Rust comparer (`platform_core.compare`, the new
member, property-tested and bench-budgeted), so the second pass has no need of
the first's solution and independence is the entire value of the check; the
verification prompt also instructs an unsolvable problem to return empty
answers, never a guessed agreement. Second, both prompts require structured
`final_answers` stated to at least four significant figures, and the comparer
runs at 0.5% relative tolerance (absolute 1e-9), conservative in the flagging
direction: answer-count differences, one-sided numbers, and empty pairs all
flag, because a wrongly flagged variant costs a professor a review while a
wrongly verified one reaches a student. Third, two deterministic fidelity
checks run server-side before the verify call is spent (the fig:// token
multiset must equal the base's, and final answers must exist), a variant's
solution blob stores the worked solution together with its final answers (the
Phase 6 `answer_match` evidence source needs both), and generation requests are
made idempotent by deriving seeds from the Idempotency-Key (a retry enqueues
the same seeds; the per-seed broker job id and the `(case_study_id, seed)`
unique index collapse duplicates), so no idempotency ledger is needed. The
review verbs follow propose-and-dispose: promote flips only `flagged` to
`manual`, an edit always lands on `manual` (the professor took responsibility),
and a variant with submissions cannot be discarded.
