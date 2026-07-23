# 0013 — Phase 2.1: the course and case study authoring surface

Date: 2026-07-23. Phase 2, milestone 2.1. Author: backend engineer (Claude).

**Case study and concept routes nest under the course, and this flags a
conflict in the backend guide.** Section 7's representative surface shows flat
routes (`POST /api/v1/case-studies/{id}/publish`,
`GET /api/v1/case-studies/{id}/variants`), but section 3.1's sharding gives
every course shard its own integer primary keys, so ids collide across courses
and a flat `/case-studies/{id}` is genuinely ambiguous: resolving it would need
either a global case study registry in `directory.db` (a second source of truth
for something the shard already owns) or a scan across shards (forbidden by the
no-cross-shard rule). The two parts of the guide cannot both hold, so per
CLAUDE.md the architecture in section 3.1 wins and the conflict is recorded
rather than silently patched. Everything course-scoped therefore lives under
`/api/v1/courses/{course_id}/...` (case-studies, concepts, and the mappings
sub-resource), which costs the frontend nothing because it always has the course
in context: a seat is scoped to exactly one course, and a professor navigates
within one. If a global case study identifier is ever wanted (for share links,
say), it becomes a deliberate directory-level addition with its own record, not
a reinterpretation of the shard's local ids.

**Publishing is the state transition only; the variant pool is Phase 5.**
Backend guide 6.3 says publishing pre-generates a pool of verified variants so
students never wait on generation, but generation and verification do not exist
until Phase 5. This milestone implements `publish` and `unpublish` as the
`draft` and `published` status flip and nothing more; the generation trigger
hangs off `publish` when 5.4 lands. No `CHECK` constraint pins the status column
(the core schema in migration `course/0003` ships without one and rebuilding the
table to add it is not worth it), so the two legal values are enforced in the
route layer, which is the only writer.

**Deletion is guarded to protect student work.** A course refuses deletion
(409) while any seat exists, because seats carry submission history and dropping
the course under them would destroy it silently; the professor revokes and
clears seats first, an explicit act. Only then is the directory row removed and
the shard file dropped (`ShardManager.drop_course`, which closes the shard
before unlinking because Windows will not delete an open SQLite file). A case
study deletes with its concept mappings in one transaction, but if variants
reference it (Phase 5 onward) the foreign key raises and the route returns 409
asking the professor to unpublish first, rather than orphaning a live practice
pool.

**One reader helper gates both audiences.** `ensure_course_reader` sits beside
`ensure_course_owner`: a professor or admin must own the course and may see
drafts, while a seat must be scoped to exactly that course and sees published
content only, so a draft is a 404 to a student, not a 403, because to a student
a draft simply does not exist yet. Case study bodies are markdown compressed
through the codec at rest (the `problem_text` dictionary, backend guide 3.3);
the plaintext exists only in transit, never in a column.
