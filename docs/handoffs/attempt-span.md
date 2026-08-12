# Handoff: the attempt span (milestone 9.6, decision 0058)

The backend now records the "start attempt" moment frontend guide 4.2 asks for,
so the submission can carry its `(started, submitted)` span. This note is the
contract and the one small change it forces on work already in progress.

## What to call

`POST /api/v1/variants/{variant_id}/attempts`, seat-only, no body. Call it when
the student opens the problem to work it, which is the moment the guide's
"start attempt" describes. It returns:

```json
{ "attempt_id": 12, "variant_id": 9, "started_at": 1786400000 }
```

Then pass that id when creating the submission:

```json
POST /api/v1/variants/9/submissions
{ "pages": [ ... ], "attempt_id": 12 }
```

`attempt_id` is optional. A submission without one is accepted and simply
carries a null span.

## Rules worth knowing before wiring it

The start is stamped by the server, not sent by the client, because the span is
shown to the professor as evidence of engaged work. There is deliberately no way
to supply a start time.

Citing an attempt that belongs to another seat, or to another variant, or that
does not exist, is not an error: the submission succeeds and its span is null. A
stale `attempt_id` from a reloaded page therefore costs the span, never the
submission, so there is no need to guard against it.

Starting twice is ordinary. A student may open a problem, put it down, and come
back; each call is its own attempt and only the cited one becomes a span. Call
it whenever the student genuinely starts, and keep the latest id.

## The two-line change this forces

`SubmissionSummary` and `HistoryEntry` gained `started_at: number | null` and
`engaged_seconds: number | null`, both required, because the server always sends
them. `SubmissionOut` gained `started_at: number | null` too.

That breaks one fixture in work currently in the tree,
`(professor)/courses/[courseId]/submissions/submission-queue.test.tsx`, whose
`row()` helper returns a complete `SubmissionSummary`. Adding

```ts
    started_at: null,
    engaged_seconds: null,
```

to that literal is the whole fix. Nothing else in `apps/web` constructs these
types, so nothing else should need touching; `SubmissionOut` appears only as a
return type.

## Where the span is meant to surface

`engaged_seconds` is derived server-side in the two places the guides want
effort legible: the student's own history (`GET /courses/{id}/history`), where
4.2b says the record is theirs, and the professor's review queue
(`GET /courses/{id}/submissions`), where it is the effort behind a submission.
Both are null when no attempt was cited, and the interface should say nothing
rather than show a zero.
