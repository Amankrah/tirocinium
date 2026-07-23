"""Emit the Litestream configuration for every shard in a data directory
(milestone 1.3): directory.db plus each course shard, each replicating to
its own prefix in the backups bucket. Regenerate and restart Litestream when
shards are added; the scheduled promotion of this into a monitored job is
milestone 9.4.

    python scripts/litestream_config.py --data-dir ../../data > litestream.yml

--config-data-dir writes container paths into the config while scanning the
real directory, which is how the drill runs Litestream in Docker on hosts
without a native binary (see infra/restore-drill.sh).
"""

import argparse
import os
import sys
from pathlib import Path, PurePosixPath


def shard_paths(data_dir: Path) -> list[Path]:
    paths = [data_dir / "directory.db"]
    courses = data_dir / "courses"
    if courses.is_dir():
        paths.extend(sorted(courses.glob("*.db")))
    return [p for p in paths if p.is_file()]


def render(
    shards: list[Path],
    data_dir: Path,
    config_data_dir: str,
    endpoint: str,
    bucket: str,
    access_key: str,
    secret_key: str,
    sync_interval: str,
    checkpoint_interval: str | None = None,
) -> str:
    lines = ["dbs:"]
    for shard in shards:
        rel = shard.relative_to(data_dir)
        config_path = str(PurePosixPath(config_data_dir) / rel.as_posix())
        replica_prefix = f"shards/{rel.as_posix().removesuffix('.db')}"
        lines += [f"  - path: {config_path}"]
        if checkpoint_interval:
            lines += [f"    checkpoint-interval: {checkpoint_interval}"]
        lines += [
            "    replicas:",
            "      - type: s3",
            f"        bucket: {bucket}",
            f"        path: {replica_prefix}",
            f"        endpoint: {endpoint}",
            f"        access-key-id: {access_key}",
            f"        secret-access-key: {secret_key}",
            "        force-path-style: true",
            f"        sync-interval: {sync_interval}",
        ]
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument(
        "--config-data-dir",
        default=None,
        help="data dir path as written into the config (defaults to --data-dir)",
    )
    parser.add_argument(
        "--endpoint", default=os.environ.get("TIRO_S3_ENDPOINT", "http://localhost:9000")
    )
    parser.add_argument(
        "--bucket", default=os.environ.get("TIRO_BACKUP_BUCKET", "tirocinium-backups")
    )
    parser.add_argument("--sync-interval", default="1s")
    parser.add_argument(
        "--checkpoint-interval",
        default=None,
        help="per-db checkpoint interval; the drill uses a short one so WAL"
        " index boundaries fall between its phases",
    )
    args = parser.parse_args()

    data_dir = args.data_dir.resolve()
    shards = shard_paths(data_dir)
    if not shards:
        print(f"no shards found under {data_dir}", file=sys.stderr)
        return 1
    sys.stdout.write(
        render(
            shards,
            data_dir,
            args.config_data_dir or data_dir.as_posix(),
            args.endpoint,
            args.bucket,
            os.environ.get("TIRO_S3_ACCESS_KEY", "tirocinium"),
            os.environ.get("TIRO_S3_SECRET_KEY", "tirocinium-dev"),
            args.sync_interval,
            args.checkpoint_interval,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
