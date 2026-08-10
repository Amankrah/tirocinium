#!/usr/bin/env bash
# The restore drill (backend guide 3.5, milestone 1.3): prove that a course
# shard replicated by Litestream can be restored to a historical point and to
# the latest state, and that a VACUUM INTO snapshot survives the round trip
# through object storage, with row counts and checksums verified. This is the
# Phase 1 gate item "restore drill passes in CI against a fixture shard".
#
# Point-in-time mechanics (decision 0008): Litestream 0.3.13's -timestamp
# restore is unreliable against MinIO, so the drill restores by WAL index. A
# short checkpoint-interval makes Litestream checkpoint between the drill's
# write phases; the WAL index recorded after phase A is then a hard boundary
# and `restore -index` reproduces exactly the phase A state. The fixture
# driver holds its writer connection open for the whole drill, as the real
# service does (closing the last connection deletes the WAL out from under
# Litestream).
#
# Runs natively wherever a litestream binary exists (CI, deploy). On hosts
# without one (the Windows dev host), the drill re-runs itself inside a Linux
# container: a live WAL database cannot be shared between a host process and
# a containerized Litestream across a Docker mount, so everything must live
# on one side. MinIO must be reachable (TIRO_S3_ENDPOINT, default
# http://localhost:9000); the script starts the compose service if needed.
#
#   ./infra/restore-drill.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="$ROOT/apps/api"
ENDPOINT="${TIRO_S3_ENDPOINT:-http://localhost:9000}"
LITESTREAM_IMAGE="litestream/litestream:0.3.13"

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
fail() { printf '\033[31mFAIL: %s\033[0m\n' "$*"; exit 1; }

# ---------------------------------------------------------------- python
if [ -n "${TIRO_PY:-}" ]; then PY="$TIRO_PY"
elif [ -x "$API/.venv/bin/python" ]; then PY="$API/.venv/bin/python"
else PY="$API/.venv/Scripts/python"; fi

minio_up() {
  "$PY" - "$ENDPOINT" <<'EOF'
import sys, urllib.request
try:
    urllib.request.urlopen(sys.argv[1] + "/minio/health/live", timeout=3)
except Exception:
    sys.exit(1)
EOF
}

# ------------------------------------------------- container trampoline
# No native litestream: run the whole drill inside one Linux container.
if ! command -v litestream >/dev/null 2>&1 && [ ! -x "$ROOT/infra/bin/litestream" ] \
   && [ "${TIRO_DRILL_INNER:-0}" != "1" ]; then
  command -v docker >/dev/null 2>&1 || fail "neither a litestream binary nor docker is available"
  say "No native litestream; running the drill inside a Linux container"
  if ! minio_up; then
    docker compose -f "$ROOT/infra/docker-compose.yml" up -d --wait minio \
      || fail "MinIO is not reachable at $ENDPOINT"
  fi
  mkdir -p "$ROOT/infra/bin"
  if [ ! -f "$ROOT/infra/bin/litestream-linux" ]; then
    CID="$(docker create "$LITESTREAM_IMAGE")"
    docker cp "$CID:/usr/local/bin/litestream" "$ROOT/infra/bin/litestream-linux"
    docker rm "$CID" >/dev/null
  fi
  if command -v cygpath >/dev/null 2>&1; then REPO="$(cygpath -w "$ROOT")"; else REPO="$ROOT"; fi
  MSYS_NO_PATHCONV=1 docker run --rm \
    --add-host host.docker.internal:host-gateway \
    -v "$REPO:/repo" \
    -e TIRO_DRILL_INNER=1 -e TIRO_PY=python3 \
    -e TIRO_S3_ENDPOINT="http://host.docker.internal:9000" \
    python:3.12-slim bash -c \
    "pip install -q boto3 pydantic \
     && install -m 0755 /repo/infra/bin/litestream-linux /usr/local/bin/litestream \
     && bash /repo/infra/restore-drill.sh"
  exit $?
fi

# ------------------------------------------------------------ the drill
if command -v litestream >/dev/null 2>&1; then LITESTREAM=litestream
else LITESTREAM="$ROOT/infra/bin/litestream"; fi

FIXTURE="$API/scripts/restore_drill_fixture.py"
BUCKET="tirocinium-drill-$(date +%s)"
DRILL_DIR="$(mktemp -d)"
DATA="$DRILL_DIR/data"
CTL="$DRILL_DIR/ctl"
CFG="$DRILL_DIR/litestream.yml"
LS_PID=""
SRV_PID=""

wait_for() { # wait_for <file> <seconds>
  local deadline=$(( $(date +%s) + $2 ))
  while [ ! -f "$1" ]; do
    [ "$(date +%s)" -ge "$deadline" ] && fail "timed out waiting for $1"
    sleep 0.3
  done
}

same_digest() { # same_digest <a.json> <b.json>
  "$PY" - "$1" "$2" <<'EOF'
import json, sys
a, b = (json.load(open(p, encoding="utf-8")) for p in sys.argv[1:3])
if a != b:
    for table in sorted(set(a) | set(b)):
        if a.get(table) != b.get(table):
            print(f"  {table}: {a.get(table)} != {b.get(table)}", file=sys.stderr)
    sys.exit(1)
EOF
}

cleanup() {
  [ -n "$SRV_PID" ] && { touch "$CTL/stop" 2>/dev/null || true; sleep 1; kill "$SRV_PID" 2>/dev/null || true; }
  [ -n "$LS_PID" ] && kill "$LS_PID" 2>/dev/null || true
  (cd "$API" && "$PY" - "$BUCKET" <<'EOF'
import sys
from app.db.backup import s3_client_from_env
client = s3_client_from_env()
bucket = sys.argv[1]
try:
    for o in client.list_objects_v2(Bucket=bucket).get("Contents", []):
        client.delete_object(Bucket=bucket, Key=o["Key"])
    client.delete_bucket(Bucket=bucket)
except Exception:
    pass
EOF
  ) 2>/dev/null || true
  rm -rf "$DRILL_DIR"
}
trap cleanup EXIT

say "Restore drill starting (bucket $BUCKET)"
cd "$API"

say "MinIO"
if ! minio_up; then
  docker compose -f "$ROOT/infra/docker-compose.yml" up -d --wait minio \
    || fail "MinIO is not reachable at $ENDPOINT"
fi
"$PY" - "$BUCKET" <<'EOF'
import sys
from app.db.backup import s3_client_from_env
s3_client_from_env().create_bucket(Bucket=sys.argv[1])
EOF

say "Fixture shard (writer connection held open for the whole drill)"
"$PY" "$FIXTURE" serve "$DATA" "$CTL" &
SRV_PID=$!
wait_for "$CTL/ready" 30
TIRO_BACKUP_BUCKET="$BUCKET" "$PY" scripts/litestream_config.py \
  --data-dir "$DATA" --checkpoint-interval 5s > "$CFG"

say "Replication up"
"$LITESTREAM" replicate -config "$CFG" >"$DRILL_DIR/litestream.log" 2>&1 &
LS_PID=$!
sleep 3

max_wal_index() {
  "$PY" - "$BUCKET" <<'EOF'
import sys
from app.db.backup import s3_client_from_env
keys = [
    o["Key"]
    for o in s3_client_from_env()
    .list_objects_v2(Bucket=sys.argv[1], Prefix="shards/courses/1")
    .get("Contents", [])
    if "/wal/" in o["Key"]
]
print(max(k.split("/")[-1].split("_")[0] for k in keys) if keys else "none")
EOF
}

say "Phase A writes and digest"
touch "$CTL/phase-a"
wait_for "$CTL/phase-a.done" 30
sleep 3
"$PY" "$FIXTURE" digest "$DATA/courses/1.db" > "$DRILL_DIR/digest-a.json"
IDX_A="$(max_wal_index)"
if [ "$IDX_A" = none ]; then tail -5 "$DRILL_DIR/litestream.log" || true; fail "no WAL segments replicated after phase A"; fi

say "Checkpoint window, then phase B writes (must not survive the point-in-time restore)"
sleep 9
touch "$CTL/phase-b"
wait_for "$CTL/phase-b.done" 30
sleep 3
"$PY" "$FIXTURE" digest "$DATA/courses/1.db" > "$DRILL_DIR/digest-b.json"
IDX_B="$(max_wal_index)"
echo "wal index after phase A: $IDX_A, after phase B: $IDX_B"
same_digest "$DRILL_DIR/digest-a.json" "$DRILL_DIR/digest-b.json" 2>/dev/null \
  && fail "phase B changed nothing; the drill is not testing anything"
[ "$IDX_A" = "$IDX_B" ] \
  && fail "no WAL index boundary between phases; point-in-time restore would be meaningless"

say "Snapshot round trip through object storage"
"$PY" - "$DATA" "$BUCKET" "$DRILL_DIR" <<'EOF'
import sys
from pathlib import Path
from app.db.backup import digest_shard, s3_client_from_env, snapshot_shard, upload_file
data, bucket, drill = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
snap = snapshot_shard(data / "courses" / "1.db", drill / "snapshot.db")
client = s3_client_from_env()
upload_file(client, snap, bucket, "drill/snapshot.db")
fetched = drill / "snapshot-fetched.db"
client.download_file(bucket, "drill/snapshot.db", str(fetched))
assert digest_shard(fetched) == digest_shard(snap), "snapshot round trip diverged"
print("snapshot digest stable through storage")
EOF

say "Stop replication, stop the service, destroy the local shard"
kill "$LS_PID"; wait "$LS_PID" 2>/dev/null || true; LS_PID=""
touch "$CTL/stop"; wait_for "$CTL/stop.done" 30; SRV_PID=""
rm -rf "$DATA"

say "Restore: point in time (wal index $IDX_A) and latest"
"$LITESTREAM" restore -config "$CFG" -index "$IDX_A" \
  -o "$DRILL_DIR/restored-a.db" "$DATA/courses/1.db"
"$LITESTREAM" restore -config "$CFG" \
  -o "$DRILL_DIR/restored-latest.db" "$DATA/courses/1.db"

say "Verify row counts and checksums"
"$PY" "$FIXTURE" digest "$DRILL_DIR/restored-a.db" > "$DRILL_DIR/digest-restored-a.json"
"$PY" "$FIXTURE" digest "$DRILL_DIR/restored-latest.db" > "$DRILL_DIR/digest-restored-latest.json"
same_digest "$DRILL_DIR/digest-a.json" "$DRILL_DIR/digest-restored-a.json" \
  || fail "point-in-time restore does not match the phase A digest"
same_digest "$DRILL_DIR/digest-b.json" "$DRILL_DIR/digest-restored-latest.json" \
  || fail "latest restore does not match the final digest"

say "Restore drill PASSED: point-in-time and latest restores verified, snapshot round trip verified"
