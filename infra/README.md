# infra

Development and operations tooling. Populated across Phase 0-1:

- `setup.sh` (0.2) — one-command toolchain and dependency bootstrap, pinned by
  `apps/api/uv.lock` and `crates/platform_core/Cargo.lock`, ending in a
  verification gate (imports, ruff, mypy strict, both test suites). Flags:
  `TIRO_SKIP_CRITERION=1` skips the slow cargo-criterion install,
  `TIRO_SKIP_VERIFY=1` provisions without running the gates.
- `docker-compose.yml` (0.1/0.2) — dev services: MinIO (object storage, S3 API
  on :9000, console on :9001) and Redis (:6379), both with healthchecks.
  `docker compose -f infra/docker-compose.yml up -d --wait`
- `bin/` (gitignored) — the litestream binary, downloaded by setup.sh on hosts
  with a matching build (CI downloads it directly; the drill extracts a Linux
  binary from the official image when needed).
- `restore-drill.sh` (1.3) — the data layer's definition of done: replicates a
  fixture course shard to MinIO with Litestream, restores to a point in time
  (WAL index, decision 0008) and to latest, verifies row counts and checksums,
  and round-trips a VACUUM INTO snapshot through object storage. Runs natively
  where a litestream binary exists and re-runs itself inside a Linux container
  elsewhere (the Windows dev host). Related scripts live in
  `apps/api/scripts/`: `litestream_config.py` (config generation per data
  dir), `snapshot_shards.py` (nightly snapshots; scheduled with alerting in
  9.4), `restore_drill_fixture.py` (the drill's fixture driver).

Scripts are kept LF (`.gitattributes`) so they run in CI regardless of checkout OS.
The build host for this milestone is Windows; the compose services and Litestream
binary target the Unix CI and deploy environments.

## Running locally

`setup.sh` provisions and gates but does not start a server; there is no launcher
script, because the API is a `create_app()` factory and the worker is an arq app.
The venv lives under `apps/api/.venv`. On Windows its binaries are in
`.venv/Scripts/`; on Linux and macOS they are in `.venv/bin/`. The examples below
show both. Backend commands run from `apps/api` unless noted.

First, start the dev services (MinIO and Redis), from the repo root:

    docker compose -f infra/docker-compose.yml up -d --wait

Second, put the local configuration in `apps/api/.env` (gitignored, loaded on
import for real runs, decision 0035; copy `apps/api/.env.example`). A JWT secret
keeps professor sessions alive across restarts, and the provider keys are needed
only for the live worker and the retrieval query embed:

    TIRO_JWT_SECRET=any-long-random-dev-string
    TIRO_ANTHROPIC_API_KEY=...
    TIRO_OPENAI_API_KEY=...

Third, create the object-storage buckets once (nothing creates them on startup;
the app only reads and writes keys within them). From `apps/api`. If MinIO
answers `BucketAlreadyOwnedByYou`, the buckets are already there: continue.

    # Windows
    .venv\Scripts\python -c "from app.db.backup import s3_client_from_env; from app.storage import SCANS_BUCKET, IMPORTS_BUCKET, ARTIFACTS_BUCKET; c=s3_client_from_env(); [c.create_bucket(Bucket=b) for b in (SCANS_BUCKET, IMPORTS_BUCKET, ARTIFACTS_BUCKET)]; print('buckets ready')"

    # Linux / macOS
    .venv/bin/python -c "from app.db.backup import s3_client_from_env; from app.storage import SCANS_BUCKET, IMPORTS_BUCKET, ARTIFACTS_BUCKET; c=s3_client_from_env(); [c.create_bucket(Bucket=b) for b in (SCANS_BUCKET, IMPORTS_BUCKET, ARTIFACTS_BUCKET)]; print('buckets ready')"

Fourth, run the API and the worker in separate terminals (still from `apps/api`).
The API serves auth, courses, case studies, seats, and the read and search
endpoints, and degrades gracefully without Redis (enqueue and SSE no-op); the
worker is what runs transcription, PDF import, and indexing, so start it (and
Redis) when you want that work to process:

    # Windows
    .venv\Scripts\uvicorn app.main:create_app --factory --reload --port 8000
    .venv\Scripts\arq app.worker.WorkerSettings

    # Linux / macOS
    .venv/bin/uvicorn app.main:create_app --factory --reload --port 8000
    .venv/bin/arq app.worker.WorkerSettings

Fifth, start the Next.js frontend from `apps/web` (pnpm is installed by
`setup.sh` when available):

    pnpm dev

The UI is then at `http://localhost:3000` (professor sign-in at `/sign-in`,
create an account at `/sign-up`, seat entry at `/enter`). The interactive API docs are at
`http://localhost:8000/docs` (routes live under `/api/v1`) and the MinIO console
at `http://localhost:9001` (login `tirocinium` / `tirocinium-dev`). `--factory`
is required because `app.main` exposes `create_app()`, not a module-level `app`.
If `import platform_core` fails after a `uv sync` (which prunes the extension),
rebuild the single wheel into the venv with the `maturin develop` command in the
`tirocinium-testing` skill.
