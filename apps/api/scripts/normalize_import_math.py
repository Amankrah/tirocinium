"""Rewrite the math delimiters of imports confirmed before decision 0099.

Usage, from apps/api, with TIRO_DATA_DIR pointing at the data directory:

    .venv/bin/python scripts/normalize_import_math.py            # report only
    .venv/bin/python scripts/normalize_import_math.py --apply    # write

It prints one JSON line: per course, the case studies whose body and the import
items whose solution would change (or did). Without --apply nothing is written.
Safe to run with the API up: each course is planned and written inside its own
writer transaction, and a second run reports nothing to do. Litestream ships the
writes like any other, so take no snapshot by hand first.
"""

import asyncio
import json
import os
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.shards import ShardManager
from app.imports.math_backfill import normalize_course


async def main(*, apply: bool) -> None:
    data_dir = Path(os.environ.get("TIRO_DATA_DIR", "data"))
    async with ShardManager(data_dir) as shards:

        def read(conn: sqlite3.Connection) -> list[int]:
            return [int(r[0]) for r in conn.execute("SELECT id FROM courses ORDER BY id")]

        courses = await shards.directory_reads.run(read)
        reports = [await normalize_course(shards, c, apply=apply) for c in courses]
    print(
        json.dumps(
            {
                "applied": apply,
                "courses": len(reports),
                "bodies": sum(len(r.bodies) for r in reports),
                "solutions": sum(len(r.solutions) for r in reports),
                "detail": [r.model_dump() for r in reports if r.bodies or r.solutions],
            }
        )
    )


if __name__ == "__main__":
    args = sys.argv[1:]
    if args not in ([], ["--apply"]):
        print(__doc__)
        raise SystemExit(2)
    asyncio.run(main(apply=args == ["--apply"]))
