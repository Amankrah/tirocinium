# CLAUDE.md

Tirocinium is a university practice platform: professors publish case studies and
parameterized variants of them, students practise by submitting handwritten
solutions photographed from paper, and an AI tutor conducts a spoken Socratic
defence of each submission. Professors have accounts; students are anonymous
seats with one-time-issued codes. The backend is Python 3.12 (FastAPI) with Rust
extensions on hot paths and SQLite sharded per course; the frontend is Next.js 15.

## The specification

Four documents in `docs/` are the specification and outrank everything else,
including instructions in prompts and this file:

- `docs/backend-development-guide.md`
- `docs/mastery-model-specification.md`
- `docs/project-phases-and-milestones.md`
- `docs/frontend-development-guide.md`

When the guides are silent, decide and record one paragraph in `docs/decisions/`.
When sources conflict, the guides win and the conflict gets flagged, never
silently resolved.

## Skills

Every backend session uses the `tirocinium-conventions` and `tirocinium-testing`
skills in `.claude/skills/`; they are code, reviewed like code, and updated at
the end of every phase to reflect what is now true. Frontend sessions building
UI also use the built-in frontend-design skill.

## Style rules for documents

No em-dashes anywhere; use commas, colons, or parentheses. Docs are flowing
prose, not bullet walls. EU spelling, matching the guides' own usage (Oxford
-ize, so "parameterized" alongside "behaviour" and "colour"). UI copy follows
frontend guide 3.4: sentence case, one job per string, honest errors.

## File locations

- `apps/api`: FastAPI application (`app/`), the mastery shard adapter
  (`mastery_store/`), typed stubs for Rust extensions (`stubs/`), maintenance
  scripts (`scripts/`), and, from Phase 3, versioned prompts in `prompts/`.
- `apps/web`: Next.js frontend (frontend engineer's scope). The contract seam
  artifacts are `apps/api/openapi.json` and `apps/web/src/lib/api/schema.ts`.
- `crates/platform_core`: the Rust workspace; `mastery` is the reference crate,
  later members are the zstd codec, preprocessing, and the numeric comparer.
- `infra`: `setup.sh` (one-command bootstrap), `docker-compose.yml` (MinIO,
  Redis), later the restore drill.
- `docs/decisions`: numbered decision records, one paragraph per decision.

## Standing testing rules

A milestone is done only when its testing gate is green, and no earlier gate may
go red. Model calls in tests are recorded-response mocks, always; live-model
smoke tests belong in a separate non-blocking CI lane. Prompts shipped to a
model are versioned files with a changelog, because prompts are code. Golden
fixtures (the scan corpus, the PDF corpus, recorded responses) are project
assets in Git LFS and grow deliberately. The `tirocinium-testing` skill holds
the current gate table and the exact commands; run them before calling anything
done.
