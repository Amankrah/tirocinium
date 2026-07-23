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
