# 0008 — Phase 1.3: restore drill mechanics

Date: 2026-07-23. Phase 1, milestone 1.3. Author: backend engineer (Claude).

Three mechanics were settled empirically while making the drill pass, none of
them specified by the guides.

**Point in time is a WAL index, not a timestamp.** Litestream 0.3.13's
`-timestamp` restore returns "no matching backups found" against MinIO even
for a timestamp after all replicated activity, so the drill pins the restore
point differently: a short `checkpoint-interval` (5 s) makes Litestream
checkpoint between the drill's write phases, each checkpoint starts a new WAL
index, and the highest replicated index recorded at the phase A digest is a
hard boundary that `restore -index` reproduces exactly. The drill fails
loudly if no index boundary appeared between phases, so the mechanism cannot
silently degrade into restoring everything.

**The fixture holds its writer connection open for the whole drill.** SQLite
deletes the WAL when a database's last connection closes, which pulls the
file out from under Litestream mid-replication (observed as "read header:
EOF" loops). The real service keeps a writer connection per shard for its
lifetime, so the drill's fixture driver does the same, coordinated with the
shell script through a command-file protocol. Relatedly, an external
`PRAGMA wal_checkpoint(TRUNCATE)` breaks Litestream's shadow WAL and must
never be used on a replicated shard; `VACUUM INTO` snapshots are the
sanctioned maintenance operation.

**On hosts without a native Litestream, the drill re-runs itself inside one
Linux container.** A live WAL database cannot be shared between a host
process and a containerized Litestream across a Docker mount (the WAL's
shared-memory index does not cross that boundary; observed as "disk I/O
error"). The drill therefore detects the situation and re-executes fully
inside `python:3.12-slim` (the fixture path needs only boto3 and pydantic,
not the Rust wheel), with the Litestream binary extracted from the official
image. CI and deploy hosts run the native path; the containerized path exists
so the drill stays runnable on the Windows dev host.
