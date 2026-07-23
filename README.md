# Tirocinium

A university practice platform: professors publish parameterized case studies;
students submit handwritten solutions and defend them in voice conversations with
an AI tutor. Named for the Roman *tirocinium*, the period of supervised practice
through which a novice became competent.

The specification lives in `docs/` and outranks convenience:

- `docs/backend-development-guide.md` — architecture, SQLite strategy, pipelines.
- `docs/frontend-development-guide.md` — stack, surfaces, the API contract seam.
- `docs/mastery-model-specification.md` — the shaky-to-solid algorithm.
- `docs/project-phases-and-milestones.md` — the ordered build and its testing gates.
- `docs/decisions/` — one paragraph per decision the guides did not settle.

## Layout

```
apps/api            Python 3.12+ FastAPI service (backend engineer)
apps/api/mastery_store   SQLite adapter over platform_core::mastery
apps/web            Next.js 15 frontend (frontend engineer)
crates/platform_core     Rust workspace: CPU-bound hot paths
crates/platform_core/mastery   the property-tested mastery model (spec v0.2)
infra               dev docker-compose, setup and restore-drill scripts
docs                the four guides plus decision records
```

## Status

Phase 0 (Foundations), milestone 0.1 complete: monorepo scaffold, the mastery
crate moved in, both suites green in the new layout (crate 15, store 7). See the
phases document for what each gate requires.

## Building the mastery extension (dev)

```
uv venv apps/api/.venv --python 3.13
uv pip install --python apps/api/.venv "maturin>=1.7,<2.0" pytest
# from crates/platform_core/mastery, with the venv active:
maturin develop --release
pytest apps/api/mastery_store -q      # 7 tests
cargo test --manifest-path crates/platform_core/Cargo.toml   # 15 tests
```
