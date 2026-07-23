"""The one place a SQLite connection is opened (backend guide 3.2).

Every connection, writer or reader, carries the exact pragma set below; there
are no ad hoc connections anywhere in the codebase, and code review treats a
bare sqlite3.connect outside this module as a defect. Connections are opened
in autocommit (isolation_level=None): transaction boundaries belong to the
writer queue, explicitly, never to Python's implicit management.
"""

import sqlite3
from pathlib import Path

# Backend guide 3.2, verbatim. test_pragma_constant_matches_guide pins this
# mapping against silent edits.
PRAGMAS: dict[str, str] = {
    "journal_mode": "WAL",
    "synchronous": "NORMAL",
    "cache_size": "-64000",
    "mmap_size": "268435456",
    "busy_timeout": "5000",
    "foreign_keys": "ON",
    "temp_store": "MEMORY",
}


def connect(path: Path, readonly: bool = False) -> sqlite3.Connection:
    """Open a shard connection with the platform pragma set applied.

    Read-only connections require the file to exist (SQLite would otherwise
    create an empty database on first touch, masking a missing shard).
    check_same_thread is off because the writer queue and read pool move
    blocking calls onto worker threads; each connection is still used by one
    holder at a time, which is the discipline that matters.
    """
    if readonly:
        uri = f"file:{path.as_posix()}?mode=ro"
        conn = sqlite3.connect(uri, uri=True, check_same_thread=False)
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(path, check_same_thread=False)
    conn.isolation_level = None
    for name, value in PRAGMAS.items():
        if readonly and name == "journal_mode":
            # journal_mode is persisted in the file and set by the writer;
            # a read-only connection cannot (and must not) rewrite it, and
            # forcing it would fail on non-WAL files such as fresh
            # VACUUM INTO snapshots.
            continue
        conn.execute(f"PRAGMA {name} = {value}")
    return conn
