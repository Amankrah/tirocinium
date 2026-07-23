"""The data layer (backend guide section 3): SQLite shards, one per course,
plus directory.db, behind exactly one connection helper, one writer queue per
shard, and a read-only pool. Nothing outside this package opens a SQLite
connection.
"""

from app.db.connection import connect
from app.db.migrations import MigrationError, apply_migrations
from app.db.pool import ReadPool
from app.db.shards import ShardManager
from app.db.writer import ShardWriter

__all__ = [
    "MigrationError",
    "ReadPool",
    "ShardManager",
    "ShardWriter",
    "apply_migrations",
    "connect",
]
