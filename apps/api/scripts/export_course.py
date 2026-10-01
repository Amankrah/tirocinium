"""Package one course for a move to another deployment (decision 0091).

What has to travel, and what does not. The pack already carries the questions,
the solutions, the figures, the concepts, the shortlists and the parameter
specs, so a fresh deployment could rebuild the course from the repository
alone. What it could not rebuild is the variant pool: those are model output
that cost real money to generate and were verified once. So the shard moves.

The shard is copied with `VACUUM INTO` through app.db.backup.snapshot_shard,
never with `cp`: a live SQLite database has a WAL beside it, and copying the
file alone can land a torn database that opens happily and is missing the last
writes. That is also the only copy mechanism Litestream tolerates (decision
0008).

Figure bytes live in object storage rather than in the shard, so they are
listed here and moved separately; the shard holds only their keys.

    .venv/bin/python scripts/export_course.py --course-id 1 --out /tmp/bree216-export
"""

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.backup import snapshot_shard
from app.db.connection import connect


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--course-id", type=int, required=True)
    parser.add_argument("--data-dir", type=Path, default=None)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--keep-flagged-from",
        default=None,
        help=(
            "Keep only flagged variants produced by this generation prompt"
            " version (for example variant-generation/v4) and drop the rest."
            " A variant flagged by a prompt that no longer exists tells the"
            " professor nothing he can act on, and the flagged queue is a"
            " place to triage real problems rather than a changelog of"
            " prompt revisions. Verified variants are never touched: their"
            " prompt version is provenance, not a verdict."
        ),
    )
    args = parser.parse_args(argv)

    data_dir = args.data_dir or Path(os.environ.get("TIRO_DATA_DIR", "data"))
    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)

    shard = data_dir / "courses" / f"{args.course_id}.db"
    if not shard.exists():
        raise SystemExit(f"No shard at {shard}")

    target = out / f"{args.course_id}.db"
    snapshot_shard(shard, target)

    pruned = 0
    if args.keep_flagged_from is not None:
        conn = connect(target)
        try:
            pruned = conn.execute(
                "DELETE FROM variants WHERE verification = 'flagged'"
                " AND generation_prompt_version IS NOT ?",
                (args.keep_flagged_from,),
            ).rowcount
            conn.commit()
        finally:
            conn.close()

    # The figure keys the shard references. Their bytes are in the imports
    # bucket and are moved with the object store, not with this file.
    conn = connect(target)
    try:
        figures = [
            {"content_hash": str(r[0]), "storage_key": str(r[1])}
            for r in conn.execute("SELECT content_hash, storage_key FROM figures")
        ]
        counts = {
            name: int(conn.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0])
            for name in (
                "case_studies",
                "variants",
                "figures",
                "concepts",
                "case_study_shortlist",
                "course_pack_items",
            )
        }
    finally:
        conn.close()

    manifest = {
        "course_id": args.course_id,
        "shard": target.name,
        "figures": figures,
        "counts": counts,
    }
    (out / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "out": str(out),
                **counts,
                "figure_objects": len(figures),
                "stale_flagged_dropped": pruned,
            }
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
