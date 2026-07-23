# infra

Development and operations tooling. Populated across Phase 0-1:

- `setup.sh` (0.2) — one-command toolchain and dependency bootstrap, pinned.
- `docker-compose.yml` (0.1/0.2) — dev services: MinIO (object storage) and Redis.
- `restore-drill.sh` (1.3) — restores a course shard to a point in time and verifies
  row counts and checksums; part of the data layer's definition of done.

Scripts are kept LF (`.gitattributes`) so they run in CI regardless of checkout OS.
The build host for this milestone is Windows; the compose services and Litestream
binary target the Unix CI and deploy environments.
