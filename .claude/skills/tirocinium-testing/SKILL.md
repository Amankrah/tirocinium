---
name: tirocinium-testing
description: How to run every Tirocinium test suite, what each phase gate requires, and where the golden fixtures live. Use in every backend session before starting a milestone and before declaring any work done.
---

# Tirocinium testing

A milestone is done only when its gate is green and every earlier gate still
passes; green never goes red. Last updated at the web scaffold (decision 0005):
Phase 0 is now complete on both sides, Phase 1 is in progress (1.1 done).

## Running the suites

All paths from the repo root. On Windows the venv binaries are under
`.venv/Scripts/`; on Linux and macOS (and CI) they are under `.venv/bin/`.

The full bootstrap and gate in one command (provisions everything, then runs
imports, lint, and both suites; see `infra/README.md` for flags):

    ./infra/setup.sh

Rust workspace, 23 tests (mastery 15: 6 property, 9 scenario; codec 8) plus
lint:

    cd crates/platform_core
    cargo test --workspace
    cargo fmt --all -- --check
    cargo clippy --all-targets -- -D warnings
    cargo clippy -p tirocinium-mastery --features python -- -D warnings

Criterion benches with the absolute-budget regression gate (decision 0004;
budgets live in `crates/platform_core/bench-thresholds.json`, revised only
deliberately and with the reference means in the file updated to match):

    cd crates/platform_core
    cargo bench --workspace
    python ../../infra/check-bench-thresholds.py

Python suite, 47 tests (25 data layer, 7 backup, 5 compression, 3 contract,
7 store) plus lint, from `apps/api`:

    cd apps/api
    .venv/Scripts/python -m pytest -q
    .venv/Scripts/ruff check .
    .venv/Scripts/mypy .

The suite imports the built extension; if `platform_core` is missing (a plain
`uv sync` also prunes it), rebuild the single wheel (decision 0006) into the
venv:

    cd apps/api
    VIRTUAL_ENV="$PWD/.venv" .venv/Scripts/maturin develop --release --manifest-path ../../crates/platform_core/python/Cargo.toml

Web suite (12 Vitest tests: the token contract pinning the guide 3.2 palette,
and the landing placeholder), plus lint, typecheck, and build, from `apps/web`
(typecheck needs a build first on a fresh checkout, decision 0005):

    cd apps/web
    pnpm test
    pnpm lint
    pnpm build
    pnpm typecheck

Contract seam regeneration after any route or model change (CI diffs both
committed artifacts; `test_committed_spec_is_fresh` enforces the spec half in
every pytest run):

    cd apps/api && .venv/Scripts/python scripts/export_openapi.py
    cd apps/web && pnpm generate:client

Dev services (MinIO on :9000/:9001, Redis on :6379). On this Windows host start
Docker Desktop first if `docker info` fails:

    docker compose -f infra/docker-compose.yml up -d --wait

The restore drill (Phase 1 gate; needs MinIO, starts it itself if docker is
available; runs containerized on hosts without a native litestream binary):

    ./infra/restore-drill.sh

## The gate table

Phase 0 (current), all green as of 0.4:

- 0.1: crate 15 tests and store 7 tests pass inside the monorepo layout; clippy
  clean on both feature sets.
- 0.2: `infra/setup.sh` from clean succeeds end to end, including its own
  verification gate (16 import checks, ruff, mypy strict, both suites).
- 0.3: the committed `openapi.json` and generated client are byte-fresh; a
  deliberately stale artifact fails CI's `contract` job (proven both
  directions before commit).
- 0.5: eight criterion benches cover the crate's public functions and pass
  their absolute budgets; the checker fails on over-budget, missing, or
  unbudgeted benches (proven both directions). The web half landed with the
  scaffold (decision 0005): CI's `web` job runs eslint, Vitest, next build,
  and tsc; Lighthouse and axe join it at the Phase 2 gate.

Phase 1, in progress:

- 1.1 (done): the pragma helper is the only door to SQLite and its exact
  values are pinned by test; the writer queue serializes and rolls back;
  migrations apply per shard at startup with gap and divergence detection;
  the course 0001 migration is pinned against mastery_store.SCHEMA; the
  mastery store runs green on a managed shard through the writer queue.
- 1.2 (done): the codec crate roundtrips by property, a trained dictionary
  beats plain on corpus text, a wrong dictionary fails loudly; dictionaries
  live per content type in course shards (course/0002); blobs compressed
  before training decompress after it; the zstandard fallback is out of the
  dependency set; everything ships as the single platform_core wheel
  (decision 0006).
- 1.3 (done): the restore drill passes (point-in-time restore by WAL index
  and latest restore both digest-verified, snapshot round trip through
  object storage stable; decision 0008) and runs in CI's `restore-drill`
  job; 7 backup tests cover the digest, VACUUM INTO, and the upload seam.
  Never run `PRAGMA wal_checkpoint(TRUNCATE)` on a replicated shard.

Remaining Phase 1 gates, for orientation: restore drill in CI against a
fixture shard; seat authorization property tests (a session can never read
another seat's rows); revoked seats fail immediately; reissue preserves history;
plaintext codes appear in exactly one response ever, asserted by a log-scanning
test; latency budget check on the read path with the 50-case fixture shard.

## Standing rules

Model calls in tests are recorded-response mocks, always; live-model smoke
tests run in a separate non-blocking CI lane. The realistic course-shard
fixture (50 case studies, 500 submissions) becomes the shared data-layer
fixture when Phase 1 builds it. Property tests belong in Rust next to the
arithmetic they pin down.

## Golden fixtures

Corpora are project assets in Git LFS (`.gitattributes` already routes pdf,
png, jpg, jpeg, heic, webp there; run `git lfs install` before adding the
first one). None exist yet. When they land, record their locations here: the
30-photo handwriting corpus arrives in Phase 3.2, the five-PDF ingestion corpus
in Phase 4, and recorded model responses accumulate from Phase 3 on.
