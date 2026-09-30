"""Load a course pack into a course (decision 0077).

    .venv/bin/python scripts/load_course_pack.py bree-216 \
        --professor prof@example.com --course-title "BREE 216"

Idempotent: run it again after a pack revision and each question is updated in
place, keeping the case study id a student's history and mastery evidence
already point at. It prints one JSON line reporting what it did, so a reload is
legible rather than silent.

The professor account is named, never created here with a password this script
chose: pass `--professor` for an account that exists, and sign up through the
product if it does not. A seeding script that minted credentials would be a
second way to make an account, and the one way is the product's.
"""

import argparse
import contextlib
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.coursepack.loader import load_into_course
from app.coursepack.schema import PACK_ROOT, load_pack
from app.db.connection import connect
from app.db.migrations import apply_migrations
from app.db.shards import COURSE_MIGRATIONS, DIRECTORY_MIGRATIONS
from app.storage import IMPORTS_BUCKET, SCANS_BUCKET, ObjectStorage


def ensure_buckets(storage: ObjectStorage) -> None:
    for bucket in (SCANS_BUCKET, IMPORTS_BUCKET):
        with contextlib.suppress(Exception):
            storage.create_bucket(Bucket=bucket)


def resolve_course(
    data_dir: Path, professor_email: str, title: str, course_id: int | None, now: int
) -> tuple[int, int]:
    """Find the professor and the course this pack loads into, creating the
    course (but never the professor) if it is not there yet. Returns
    (course_id, author_id)."""
    conn = connect(data_dir / "directory.db")
    try:
        apply_migrations(conn, DIRECTORY_MIGRATIONS)
        email = professor_email.strip().lower()
        row = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if row is None:
            raise SystemExit(
                f"No professor account for {email} in {data_dir}. Sign up through"
                " the product first; this script never mints an account."
            )
        author_id = int(row[0])

        if course_id is None:
            found = conn.execute(
                "SELECT id FROM courses WHERE title = ? AND owner_id = ?",
                (title, author_id),
            ).fetchone()
            if found is None:
                cursor = conn.execute(
                    "INSERT INTO courses (title, created_at, owner_id) VALUES (?, ?, ?)",
                    (title, now, author_id),
                )
                course_id = int(cursor.lastrowid or 0)
            else:
                course_id = int(found[0])
        conn.commit()
        return course_id, author_id
    finally:
        conn.close()


def pin_catalogue(
    data_dir: Path, course_id: int, catalogue_id: str | None, version: int | None
) -> None:
    """Pin the course to the materials catalogue the pack names (directory
    migration 0005). A course that does not quote leaves both null."""
    if catalogue_id is None:
        return
    conn = connect(data_dir / "directory.db")
    try:
        conn.execute(
            "UPDATE courses SET catalogue_id = ?, catalogue_version = ? WHERE id = ?",
            (catalogue_id, version, course_id),
        )
        conn.commit()
    finally:
        conn.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pack_id")
    parser.add_argument("--version", type=int, default=1)
    parser.add_argument("--professor", required=True)
    parser.add_argument("--course-title", default=None)
    parser.add_argument("--course-id", type=int, default=None)
    parser.add_argument("--data-dir", type=Path, default=None)
    args = parser.parse_args(argv)

    data_dir = args.data_dir or Path(os.environ.get("TIRO_DATA_DIR", "data"))
    (data_dir / "courses").mkdir(parents=True, exist_ok=True)
    now = int(time.time())

    pack = load_pack(args.pack_id, args.version)
    course_id, author_id = resolve_course(
        data_dir, args.professor, args.course_title or pack.title, args.course_id, now
    )
    pin_catalogue(data_dir, course_id, pack.catalogue_id, pack.catalogue_version)

    from app.storage import get_object_storage

    storage = get_object_storage()
    ensure_buckets(storage)

    conn = connect(data_dir / "courses" / f"{course_id}.db")
    try:
        apply_migrations(conn, COURSE_MIGRATIONS)
        report = load_into_course(
            pack=pack,
            pack_root=PACK_ROOT / pack.id,
            conn=conn,
            storage=storage,
            course_id=course_id,
            author_id=author_id,
            now=now,
        )
        conn.commit()
    finally:
        conn.close()

    print(json.dumps(report.model_dump()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
