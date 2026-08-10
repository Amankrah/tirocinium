"""Verify that every shard has a recent, non-empty snapshot in object storage
(backend guide 3.5, milestone 9.4). Run from apps/api:

    .venv/bin/python scripts/verify_backups.py --data-dir ../../data

Prints a JSON report and exits non-zero when any shard's backup is missing,
stale, or empty, so the scheduled job can alert on the exit code and attach the
report. The restore drill proves the mechanism restores; this proves the
artefacts a restore would need are actually there, which is the failure a drill
against its own fixture cannot see.

Discovering no shards at all is an error, not a pass: it means discovery or the
data directory is wrong, and reporting green for a course list nobody found is
exactly the false comfort this job exists to prevent.
"""

import argparse
import datetime
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.backup import (
    DEFAULT_MAX_AGE_SECONDS,
    s3_client_from_env,
    verify_snapshots,
)
from scripts.litestream_config import shard_paths


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument(
        "--bucket",
        default=os.environ.get("TIRO_SNAPSHOT_BUCKET", "tirocinium-snapshots"),
    )
    parser.add_argument(
        "--max-age-seconds",
        type=float,
        default=float(
            os.environ.get("TIRO_BACKUP_MAX_AGE_SECONDS", DEFAULT_MAX_AGE_SECONDS)
        ),
    )
    args = parser.parse_args()

    data_dir = args.data_dir.resolve()
    shards = [p.relative_to(data_dir).as_posix() for p in shard_paths(data_dir)]
    if not shards:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": f"no shards found under {data_dir}; nothing was verified",
                }
            )
        )
        return 2

    result = verify_snapshots(
        s3_client_from_env(),
        args.bucket,
        shards,
        now=datetime.datetime.now(datetime.UTC),
        max_age_seconds=args.max_age_seconds,
    )
    print(result.model_dump_json(indent=2))
    if not result.ok:
        for failure in result.failures:
            print(f"FAIL {failure.shard}: {failure.reason}", file=sys.stderr)
        return 1
    print(f"{len(result.snapshots)} shard(s) have current snapshots", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
