# apps/web

The Next.js 15 frontend (App Router, TypeScript strict), owned by the frontend
engineer and specified in `docs/frontend-development-guide.md`. Scaffolded here in
Phase 0.1 as a monorepo placeholder; its build order begins in the frontend guide's
section 8. It consumes the typed client generated from the backend's `openapi.json`
(the contract seam wired in Phase 0.3).

The seam is live: `pnpm generate:client` regenerates `src/lib/api/schema.ts`
from `../api/openapi.json`, and CI fails if either committed artifact is stale
(decision 0003). After any backend route change: regenerate the spec in
`apps/api` (`python scripts/export_openapi.py`), rerun `pnpm generate:client`
here, commit both.
