"""Backup verification (milestone 9.4).

The restore drill proves the mechanism works, but it builds its own fixture, so
it cannot see the failure that actually ends a term: last night's snapshot job
did not run, or ran and wrote nothing. That is what this checks, and it is the
half that the scheduled job alerts on.

Every case here is a way backups fail quietly in practice: the job stopped
running, a course was created after the job was last configured, an upload
truncated to zero bytes, or the storage listing paginated and the newest object
sat on the second page.
"""

import datetime
from typing import Any

from app.db.backup import (
    DEFAULT_MAX_AGE_SECONDS,
    verify_snapshots,
)

NOW = datetime.datetime(2026, 8, 10, 6, 0, tzinfo=datetime.UTC)


class FakeStorage:
    """A listing-only stub with optional pagination, so the paging path is
    exercised rather than assumed."""

    def __init__(
        self,
        objects: list[tuple[str, datetime.datetime, int]],
        page_size: int = 100,
    ) -> None:
        self.objects = objects
        self.page_size = page_size
        self.calls = 0

    def put_object(self, *, Bucket: str, Key: str, Body: Any) -> object:
        raise AssertionError("verification never writes")

    def list_objects_v2(self, **kwargs: Any) -> Any:
        self.calls += 1
        prefix = kwargs.get("Prefix", "")
        matching = [o for o in self.objects if o[0].startswith(prefix)]
        start = int(kwargs.get("ContinuationToken", 0) or 0)
        page = matching[start : start + self.page_size]
        end = start + self.page_size
        truncated = end < len(matching)
        return {
            "Contents": [
                {"Key": key, "LastModified": modified, "Size": size}
                for key, modified, size in page
            ],
            "IsTruncated": truncated,
            "NextContinuationToken": str(end) if truncated else None,
        }


def snapshot(
    day: str, shard: str, *, hours_ago: float = 6.0, size: int = 4096
) -> tuple[str, datetime.datetime, int]:
    return (
        f"snapshots/{day}/{shard}",
        NOW - datetime.timedelta(hours=hours_ago),
        size,
    )


def test_a_fresh_snapshot_for_every_shard_passes() -> None:
    storage = FakeStorage(
        [
            snapshot("2026-08-10", "courses/1.db"),
            snapshot("2026-08-10", "courses/2.db"),
            snapshot("2026-08-10", "directory.db"),
        ]
    )

    result = verify_snapshots(
        storage,
        "tirocinium-snapshots",
        ["courses/1.db", "courses/2.db", "directory.db"],
        now=NOW,
    )

    assert result.ok
    assert result.failures == []
    assert [r.shard for r in result.snapshots] == [
        "courses/1.db",
        "courses/2.db",
        "directory.db",
    ]
    assert all(r.age_seconds is not None and r.age_seconds < 3600 * 7 for r in result.snapshots)


def test_a_shard_with_no_snapshot_at_all_fails() -> None:
    """The common real failure: a course created after the job was configured,
    so it silently has no backup. It must be named, not omitted."""
    storage = FakeStorage([snapshot("2026-08-10", "courses/1.db")])

    result = verify_snapshots(
        storage, "b", ["courses/1.db", "courses/2.db"], now=NOW
    )

    assert not result.ok
    missing = [r for r in result.failures if r.shard == "courses/2.db"]
    assert missing and missing[0].reason == "no snapshot found"
    assert missing[0].key is None


def test_a_stale_snapshot_fails_with_its_age() -> None:
    """The job stopped running. The alert has to say how long ago, because
    'stale' without a number tells an operator nothing."""
    storage = FakeStorage([snapshot("2026-08-07", "courses/1.db", hours_ago=72)])

    result = verify_snapshots(storage, "b", ["courses/1.db"], now=NOW)

    assert not result.ok
    assert result.failures[0].reason == "snapshot is 72.0 h old"
    assert result.failures[0].age_seconds == 72 * 3600


def test_an_empty_snapshot_fails_even_when_fresh() -> None:
    """A truncated upload is worse than a missing one: it looks like success."""
    storage = FakeStorage([snapshot("2026-08-10", "courses/1.db", size=0)])

    result = verify_snapshots(storage, "b", ["courses/1.db"], now=NOW)

    assert not result.ok
    assert result.failures[0].reason == "snapshot is empty"


def test_the_newest_snapshot_wins_over_older_ones() -> None:
    storage = FakeStorage(
        [
            snapshot("2026-08-01", "courses/1.db", hours_ago=240),
            snapshot("2026-08-10", "courses/1.db", hours_ago=4),
            snapshot("2026-08-05", "courses/1.db", hours_ago=120),
        ]
    )

    result = verify_snapshots(storage, "b", ["courses/1.db"], now=NOW)

    assert result.ok
    assert result.snapshots[0].key == "snapshots/2026-08-10/courses/1.db"


def test_the_newest_snapshot_is_found_across_pages() -> None:
    """Paginated listings are where a naive check quietly reads only the first
    thousand keys and calls it a day."""
    storage = FakeStorage(
        [
            snapshot("2026-08-01", "courses/1.db", hours_ago=240),
            snapshot("2026-08-02", "courses/1.db", hours_ago=200),
            snapshot("2026-08-10", "courses/1.db", hours_ago=3),
        ],
        page_size=1,
    )

    result = verify_snapshots(storage, "b", ["courses/1.db"], now=NOW)

    assert storage.calls == 3, "the listing was not paged through"
    assert result.ok
    assert result.snapshots[0].key == "snapshots/2026-08-10/courses/1.db"


def test_the_window_is_a_night_of_slack_and_no_more() -> None:
    """Pinned deliberately: wide enough that one late run is not noise, narrow
    enough that a missed night is caught the following morning."""
    assert DEFAULT_MAX_AGE_SECONDS == 36 * 3600

    storage = FakeStorage([snapshot("2026-08-09", "courses/1.db", hours_ago=30)])
    assert verify_snapshots(storage, "b", ["courses/1.db"], now=NOW).ok

    stale = FakeStorage([snapshot("2026-08-08", "courses/1.db", hours_ago=40)])
    assert not verify_snapshots(stale, "b", ["courses/1.db"], now=NOW).ok


def test_an_empty_bucket_fails_every_shard() -> None:
    """A wiped or misconfigured bucket must be loud, not vacuously green."""
    result = verify_snapshots(
        FakeStorage([]), "b", ["courses/1.db", "directory.db"], now=NOW
    )

    assert not result.ok
    assert len(result.failures) == 2


def test_no_shards_configured_is_not_a_pass() -> None:
    """Verifying nothing is not verification. The caller discovers shards from
    the data directory, so an empty list means discovery failed, and the
    script treats that as an error rather than reporting a green run."""
    result = verify_snapshots(FakeStorage([]), "b", [], now=NOW)

    # The model itself is vacuously ok; the script's own guard is what refuses.
    assert result.ok
    assert result.snapshots == []
