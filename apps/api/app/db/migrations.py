"""Numbered migrations, applied per shard (backend guide 3.4): all schema
changes go through files named NNNN_description.sql, applied in order and
recorded in schema_migrations. Nobody edits a shard by hand.

The applied set must be exactly a prefix of the migration tree: a recorded
migration the tree does not contain, or a hole in the prefix, is divergence
and stops startup loudly rather than being papered over. Each migration runs
atomically (BEGIN and COMMIT wrap the script and its record together), so a
crash mid-migration leaves the shard on the previous migration cleanly.
"""

import re
import time
from pathlib import Path
from sqlite3 import Connection

_NAME = re.compile(r"^\d{4}_[a-z0-9_]+\.sql$")

_TRACKING = """
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
"""


class MigrationError(Exception):
    """The shard's applied migrations diverge from the migration tree."""


def migration_files(tree: Path) -> list[str]:
    """The migration filenames of a tree, sorted, names validated."""
    names = sorted(p.name for p in tree.glob("*.sql"))
    for name in names:
        if not _NAME.match(name):
            raise MigrationError(
                f"migration {name!r} in {tree} does not match NNNN_description.sql"
            )
    return names


def apply_migrations(conn: Connection, tree: Path) -> list[str]:
    """Bring one shard up to date against a migration tree. Returns the
    filenames applied in this call, in order."""
    conn.executescript(_TRACKING)
    files = migration_files(tree)
    applied = [
        row[0]
        for row in conn.execute(
            "SELECT filename FROM schema_migrations ORDER BY filename"
        ).fetchall()
    ]

    unknown = sorted(set(applied) - set(files))
    if unknown:
        raise MigrationError(
            f"shard has applied migrations missing from {tree}: {', '.join(unknown)}"
        )
    if applied != files[: len(applied)]:
        missing = sorted(set(files[: len(applied)]) - set(applied))
        raise MigrationError(
            f"shard's applied migrations are not a prefix of {tree}:"
            f" missing {', '.join(missing)}"
        )

    pending = files[len(applied) :]
    now = int(time.time())
    for name in pending:
        sql = (tree / name).read_text(encoding="utf-8")
        try:
            conn.executescript(
                "BEGIN;\n"
                f"{sql}\n"
                "INSERT INTO schema_migrations (filename, applied_at)"
                f" VALUES ('{name}', {now});\n"
                "COMMIT;"
            )
        except BaseException:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
            raise
    return pending
