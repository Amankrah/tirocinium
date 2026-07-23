# 0003 — Phase 0.3: where the contract lives and how staleness is enforced

Date: 2026-07-23. Phase 0, milestone 0.3. Author: backend engineer (Claude).

**The committed spec lives at `apps/api/openapi.json`.** The guides call it "shared"
without naming a path; it sits with the code that generates it, and `apps/web`'s
`generate:client` script reads it by relative path. Rendering is deterministic by
construction (sorted keys, two-space indent, trailing newline, LF), so staleness is
a byte comparison: CI's `contract` job regenerates the spec and the typed client
and fails on any git diff, and `test_committed_spec_is_fresh` enforces the spec
half in every pytest run, including setup.sh's gate. Both directions were proven
before commit: an edited client fails, an unexported route change fails, and
regeneration restores green.

**A minimal `apps/web/package.json` was created by the backend engineer.** The web
workspace is the frontend engineer's scope, but the phases document requires the
seam to exist "before either builds features", and the seam needs a manifest for
`pnpm generate:client`. The manifest carries only openapi-typescript and
typescript (pinned by the committed pnpm-lock.yaml) plus the generation script;
the Next.js scaffold remains entirely the frontend engineer's to add around it.
This is flagged here as a deliberate, minimal touch on a neighboring scope, made
to unblock the shared gate rather than to pre-empt their layout: if the frontend
engineer relocates the generated client from `src/lib/api/schema.ts`, they update
the script path and the CI diff list together.
