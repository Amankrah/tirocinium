"""Blob compression for shard columns (backend guide 3.3, milestone 1.2).

All codec arithmetic lives in Rust (platform_core.codec); this module only
resolves which dictionary applies (shard state) and shuttles opaque bytes.
Python never touches raw zstd.

Dictionaries are per content type per shard, trained once a course has a
corpus. Until then blobs compress without a dictionary, and because zstd
frames self-describe their dictionary, blobs written before training stay
readable after it. Functions take the shard connection they are given (inside
a writer or read-pool callable); this module opens nothing itself.
"""

import sqlite3
import time
from collections.abc import Sequence
from typing import Literal

from platform_core import codec

ContentType = Literal["problem_text", "handwriting"]

# zstd's canonical dictionary size budget (110 KiB), plenty for text corpora.
DICT_CAPACITY = 112_640


def train_and_store_dictionary(
    conn: sqlite3.Connection,
    content_type: ContentType,
    samples: Sequence[bytes],
    capacity: int = DICT_CAPACITY,
) -> int:
    """Train a dictionary on the course's own corpus and store it in the
    shard, replacing any previous one for the content type. Returns the
    dictionary row id. Blobs already compressed keep decompressing (their
    frames name the dictionary they used, or none)."""
    dictionary = codec.train_dictionary(list(samples), capacity)
    conn.execute(
        "INSERT INTO zstd_dictionaries (content_type, dict, trained_at)"
        " VALUES (?, ?, ?)"
        " ON CONFLICT(content_type) DO UPDATE SET"
        "   dict = excluded.dict, trained_at = excluded.trained_at",
        (content_type, dictionary, int(time.time())),
    )
    row = conn.execute(
        "SELECT id FROM zstd_dictionaries WHERE content_type = ?", (content_type,)
    ).fetchone()
    return int(row[0])


def load_dictionary(conn: sqlite3.Connection, content_type: ContentType) -> bytes | None:
    row = conn.execute(
        "SELECT dict FROM zstd_dictionaries WHERE content_type = ?", (content_type,)
    ).fetchone()
    return None if row is None else bytes(row[0])


def compress_text(
    conn: sqlite3.Connection, content_type: ContentType, text: str
) -> bytes:
    """Compress a text blob for storage in a shard column, with the shard's
    dictionary for this content type when one is trained."""
    return codec.compress(text.encode("utf-8"), load_dictionary(conn, content_type))


def decompress_text(
    conn: sqlite3.Connection, content_type: ContentType, blob: bytes
) -> str:
    return codec.decompress(blob, load_dictionary(conn, content_type)).decode("utf-8")
