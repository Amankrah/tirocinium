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
  with a matching build.
- `restore-drill.sh` (1.3) — restores a course shard to a point in time and verifies
  row counts and checksums; part of the data layer's definition of done.

Scripts are kept LF (`.gitattributes`) so they run in CI regardless of checkout OS.
The build host for this milestone is Windows; the compose services and Litestream
binary target the Unix CI and deploy environments.
