"""Nightly VACUUM INTO snapshots of every shard, uploaded to object storage
(backend guide 3.5, milestone 1.3). Run from apps/api:

    .venv/Scripts/python scripts/snapshot_shards.py --data-dir ../../data

Each shard is vacuumed to a temporary file and stored under
snapshots/{UTC date}/{relative shard path} in the snapshots bucket. The
scheduled job that runs this, verifies the result, and alerts on failure is
.github/workflows/backup-drill.yml (milestone 9.4); scripts/verify_backups.py
is the check that the artefacts it wrote are really there and current.
"""

import argparse
import datetime
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.backup import s3_client_from_env, snapshot_shard, upload_file
from scripts.litestream_config import shard_paths


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument(
        "--bucket",
        default=os.environ.get("TIRO_SNAPSHOT_BUCKET", "tirocinium-snapshots"),
    )
    args = parser.parse_args()

    data_dir = args.data_dir.resolve()
    shards = shard_paths(data_dir)
    if not shards:
        print(f"no shards found under {data_dir}", file=sys.stderr)
        return 1

    client = s3_client_from_env()
    stamp = datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%d")
    for shard in shards:
        rel = shard.relative_to(data_dir).as_posix()
        key = f"snapshots/{stamp}/{rel}"
        with tempfile.TemporaryDirectory() as tmp:
            snap = snapshot_shard(shard, Path(tmp) / "snapshot.db")
            upload_file(client, snap, args.bucket, key)
        print(f"{rel} -> s3://{args.bucket}/{key}")
    print(f"{len(shards)} shard(s) snapshotted")
    return 0


if __name__ == "__main__":
    sys.exit(main())
