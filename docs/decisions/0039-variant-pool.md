# 0039: The pool fill is one sequential job, and the dry pool serves the base

Milestone 5.4 makes the pool invariant structural rather than probabilistic.
The practice read (`GET .../case-studies/{id}/practice-variant`, any course
reader, published-only for seats) picks a random servable variant (verified or
manual, never flagged), prefers one other than the `exclude` on screen, and
returns body and id only, never a solution; when the pool has nothing servable
it returns the base case study's body with a null id instantly, because
repeating or falling back always beats waiting, and it opportunistically
enqueues a background top-up when the pool sits below target. Pre-generation
hangs off publish: a published case study with a parameter spec enqueues
`fill_variant_pool`, a single sequential worker job per case study (the arq
job id collapses repeats), which is guide 6.4's generation concurrency cap
made structural: one generation call in flight per case study, no semaphore
bookkeeping. The fill tops up only the shortfall (target
`TIRO_VARIANT_POOL_TARGET`, default the guide's 20), counts flagged attempts
against a 3x-target ceiling so a case study whose variants keep flagging stops
burning budget, and checks a rolling 30-day per-course token budget
(`TIRO_GENERATION_TOKEN_BUDGET`) read from the new `token_usage` table
(migration course/0016), which the generation pipeline now writes one row per
model call from the provider's usage block (zero in recorded replays). The
phase gate's empty-generation-budget simulation is a test: fifty consecutive
practice reads against a dry pool and a zero budget all answer instantly with
the base body and zero model calls on the request path.
