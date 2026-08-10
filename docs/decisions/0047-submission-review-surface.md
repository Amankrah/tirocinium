# 0047: the professor's submission review read (milestone 8.1)

Grading already existed from 6.2, so 8.1's backend gap was the read half: every
submission endpoint was seat-only, and a professor was explicitly refused on all
of them. The review surface is therefore a separate course-scoped router
(`app/submissions/review.py`) rather than a widening of the seat endpoints,
because the two audiences want different shapes and mixing them would put a
role branch inside every seat read. It nests under the course like every other
professor surface (decision 0013), since per-shard submission ids collide across
courses, and gates on `ensure_course_owner`. Three routes: a cursor-paginated
list that acts as the review queue, filterable by status and by variant and
carrying the grade already given; a detail that puts each page's scan beside its
reading with region boxes and per-region confidence, which is what the
hover-linking and low-confidence highlighting of frontend guide 4.4 are built
from; and a per-page rendition read, because presigned URLs are short-lived and
a long review session outlives them, so refreshing one page should not mean
refetching the whole submission. Two things are deliberately absent. The
variant's body and reference solution are not duplicated, because
`GET /courses/{id}/variants/{variant_id}` already serves both to the owner and
the detail carries the `variant_id` to reach it. And no new column or migration
was needed: `submissions.grade`, `graded_at`, and the page renditions from
0005 and 0008 already held everything. Seat numbers come from the directory in
Python, never a SQL join, since they live in a different database from the
submissions that reference them, and the seat number is the only thing about a
student the surface carries anywhere.
