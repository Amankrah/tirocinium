"""Fixture driver for the restore drill (infra/restore-drill.sh).

The driver holds the course shard's writer connection open for its whole
lifetime, like the real service does; SQLite deletes the WAL when the last
connection closes, which would pull the file out from under Litestream
mid-drill. Coordination with the shell script is a command-file protocol:

    serve <data-dir> <ctl-dir>   init shards, then wait for command files
                                 (phase-a, phase-b, stop), acknowledging
                                 each with <command>.done
    digest <shard-path>          print the shard digest as JSON (read-only,
                                 safe to run from a separate process)
"""

import json
import sys
import time
from pathlib import Path
from sqlite3 import Connection

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.backup import digest_shard
from app.db.connection import connect
from app.db.migrations import apply_migrations
from app.db.shards import COURSE_MIGRATIONS, DIRECTORY_MIGRATIONS


def _init(data_dir: Path) -> Connection:
    directory = connect(data_dir / "directory.db")
    apply_migrations(directory, DIRECTORY_MIGRATIONS)
    directory.execute(
        "INSERT INTO courses (id, title, created_at) VALUES (1, 'Drill 101', 0)"
    )
    directory.close()

    course = connect(data_dir / "courses" / "1.db")
    apply_migrations(course, COURSE_MIGRATIONS)
    course.executescript(
        "INSERT INTO concepts (id, name, position) VALUES (7, 'DCF', 1);"
        "INSERT INTO concepts (id, name, position) VALUES (8, 'WACC', 2);"
        "INSERT INTO case_study_concepts (case_study_id, concept_id, weight)"
        " VALUES (1, 7, 1.0);"
    )
    return course


def _insert_events(conn: Connection, start: int, count: int) -> None:
    for i in range(start, start + count):
        conn.execute(
            "INSERT INTO evidence_events"
            " (seat_id, concept_id, source, score, confidence, k, ref_kind,"
            "  ref_id, created_at)"
            " VALUES (?, 7, 'answer_match', 1.0, 0.9, 1.0, 'submission', ?, ?)",
            (1 + i % 5, i, i * 3600),
        )


def serve(data_dir: Path, ctl_dir: Path) -> None:
    ctl_dir.mkdir(parents=True, exist_ok=True)
    conn = _init(data_dir)
    (ctl_dir / "ready").touch()
    try:
        while True:
            if (ctl_dir / "phase-a").exists() and not (ctl_dir / "phase-a.done").exists():
                _insert_events(conn, start=100, count=25)
                (ctl_dir / "phase-a.done").touch()
            if (ctl_dir / "phase-b").exists() and not (ctl_dir / "phase-b.done").exists():
                _insert_events(conn, start=1000, count=40)
                (ctl_dir / "phase-b.done").touch()
            if (ctl_dir / "stop").exists():
                return
            time.sleep(0.2)
    finally:
        conn.close()
        (ctl_dir / "stop.done").touch()


def main() -> int:
    command = sys.argv[1]
    if command == "serve":
        serve(Path(sys.argv[2]), Path(sys.argv[3]))
    elif command == "digest":
        digest = digest_shard(Path(sys.argv[2]))
        print(json.dumps({t: d.model_dump() for t, d in sorted(digest.items())}))
    else:
        print(f"unknown command {command!r}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
