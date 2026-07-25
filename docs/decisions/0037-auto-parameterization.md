# 0037: Auto-parameterization is a stored draft with server-computed positions

Milestone 5.2 runs the guide 6.2 proposal call inline behind a `SpecProposer`
text seam (Anthropic live under `prompts/auto-parameterize/v1`, recorded in
tests), one bounded model call per professor action deduped by Idempotency-Key,
the same reasoning as 0036's frozen check rather than worker plumbing for an
interactive editor action. The model returns parameters carrying a rationale
and the exact `literal` each value has in the question text, and the server
computes token positions itself by searching the body for that literal (a
literal the body does not contain gets an honest empty list): model-claimed
offsets are never trusted. The document the model reads is the confirmed
question and solution as delimited untrusted content plus the figure-frozen
display values from the 0036 cache, and the frozen check runs again on the
model's output, so a conflicting proposal reaches the professor as a locked
value with its reason, never as part of the draft. The full response payload is
stored compressed in `spec_proposals` (migration course/0014) with model and
prompt provenance, which gives idempotent retries an exact replay; the proposal
is never the spec (the professor saves through the 5.1 PUT), and that save
scores the latest unsaved proposal (parameters kept, changed, dropped, added,
and an invariants edit distance) as guide 6.2's prompt-quality signal for the
Phase 8 dashboards.
