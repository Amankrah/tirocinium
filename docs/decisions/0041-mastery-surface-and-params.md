# 0041: The mastery surface is seat-only plus a distribution, and params live in the directory

The Phase 6 API keeps the spec's two lenses distinct. `GET /courses/{id}/mastery`
and `GET /courses/{id}/revisit` are seat-only (a professor gets 403, not an
individual-seat view; spec section 6's per-seat history read is deferred to the
Phase 8 review surfaces), every concept ships with its evidence trail rendered
by the Rust core (`evidence_trail_json`, newly exposed through the wheel) over
the superseded stream so a trail never cites retracted evidence, and unseen
concepts appear explicitly with empty trails. The revisit queue implements
spec section 5 verbatim: highest mapping weight first among published case
studies, cases attempted within 48 hours excluded, one unattempted servable
variant drawn per concept, and a concept with no drawable variant still lists,
calmly, with none. The professor's `GET /courses/{id}/mastery/distribution`
returns per-concept label counts only (unseen computed against the directory's
active seat count; no per-seat ranking exists in the shape) with a `gaps` field
that stays empty until Phase 7's defense rubrics start naming them. Grading is
`POST /courses/{id}/submissions/{id}/grade` with a score already on the spec's
[0,1] scale; it stores the grade on the submission and emits one
professor_grade event per mapped concept in the same writer transaction, the
store's supersession replay retracting the submission's automatic events. The
active parameter set lives in the new directory `mastery_params` table
(defaults from the crate when empty), and `scripts/migrate_mastery_params.py`
is the 6.3 path: activate a version, replay every course shard under it in one
writer transaction each, version recorded on every recomputed state.
