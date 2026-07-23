# apps/web

The Next.js 15 frontend (App Router, TypeScript strict, Tailwind v4 on the
token layer in `src/styles/tokens.css`), owned by the frontend engineer and
specified in `docs/frontend-development-guide.md`. Scaffolded in full at the
close of Phase 0 (decision 0005); its build order follows the frontend guide's
section 8 through the phases document's gates.

Commands (pnpm, from this directory): `dev`, `build`, `lint` (eslint),
`typecheck` (tsc, after a build on fresh checkouts, see decision 0005), and
`test` (Vitest with Testing Library). CI runs all of them in the `web` job.

The contract seam is live: `pnpm generate:client` regenerates
`src/lib/api/schema.ts` from `../api/openapi.json`, and CI fails if either
committed artifact is stale (decision 0003). After any backend route change:
regenerate the spec in `apps/api` (`python scripts/export_openapi.py`), rerun
`pnpm generate:client` here, commit both. The generated `schema.ts` is never
hand-edited and is excluded from lint.
