"""Milestone 9.1: load against the backend guide's p95 budgets.

The guide's section 2 budgets are p95 under 150 ms for API reads and under
400 ms for writes, excluding AI calls. This drives a simulated 80-seat course
through the real application under a deadline-night traffic shape, concurrent
seats reading their course and then bursting into submissions, and measures
those two budgets on the real handlers: the authorization dependency layer, the
shard read pool, blob decompression, and the telemetry middleware all included,
because all of them are on the request path in production.

What this does and does not measure. It exercises the ASGI application in
process, so the numbers are handler time and exclude network, TLS, and the
reverse proxy, which is exactly what the guide's budgets are about ("excluding
AI calls" and, in the same spirit, excluding the wire). AI calls do not appear
because no worker runs: `complete` enqueues onto the null queue, which is the
honest shape of the request path, since the guide puts stages 2 to 4 off it
deliberately. The budgets are asserted bare, without a headroom factor, because
the measured p95 sits several times under them; the numbers are printed on every
run so a regression is visible in the log long before it crosses the line.
"""

import asyncio
import random
import statistics
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from functools import partial
from pathlib import Path
from typing import Any

import httpx
import pytest

from app.db.connection import connect
from app.db.fixtures import SEATS, build_course_shard
from app.main import create_app
from app.storage import get_object_storage
from app.submissions.test_submissions import FakeObjectStorage

READ_BUDGET_MS = 150.0
WRITE_BUDGET_MS = 400.0

# Deadline night: most of the class is reading, a steady minority is submitting.
CONCURRENT_SEATS = 16
ROUNDS_PER_SEAT = 6
MB = 1024 * 1024


class Timings:
    """Per-class durations, kept separate because the budgets are separate."""

    def __init__(self) -> None:
        self.reads: list[float] = []
        self.writes: list[float] = []
        self.statuses: list[int] = []

    def p95(self, samples: list[float]) -> float:
        ordered = sorted(samples)
        return ordered[max(0, int(len(ordered) * 0.95) - 1)]

    def report(self, name: str, samples: list[float], budget: float) -> str:
        return (
            f"{name}: n={len(samples)} p50={statistics.median(samples) * 1000:.1f}ms"
            f" p95={self.p95(samples) * 1000:.1f}ms"
            f" max={max(samples) * 1000:.1f}ms budget={budget:.0f}ms"
        )


async def timed(
    timings: Timings, kind: str, call: Callable[[], Awaitable[httpx.Response]]
) -> httpx.Response:
    started = time.perf_counter()
    response = await call()
    elapsed = time.perf_counter() - started
    (timings.reads if kind == "read" else timings.writes).append(elapsed)
    timings.statuses.append(response.status_code)
    return response


def seed_course_content(data_dir: Path, course_id: int) -> None:
    """Overlay the realistic fixture (50 published case studies with verified
    variants, 500 processed submissions) onto the course the API just created,
    so the load runs against a term's worth of data rather than an empty shard."""
    build_course_shard(data_dir / "courses" / f"{course_id}.db")


async def build_world(
    client: httpx.AsyncClient,
    storage: FakeObjectStorage,
    data_dir: Path,
    app: Any,
) -> tuple[int, list[str]]:
    signup = await client.post(
        "/api/v1/auth/signup",
        json={"email": "prof@example.edu", "password": "a sensible passphrase"},
    )
    assert signup.status_code == 201, signup.text
    headers = {"Authorization": f"Bearer {signup.json()['token']}"}

    course = await client.post("/api/v1/courses", json={"title": "FDSC 315"}, headers=headers)
    assert course.status_code == 201, course.text
    course_id = int(course.json()["id"])

    seats = await client.post(
        f"/api/v1/courses/{course_id}/seats", json={"count": SEATS}, headers=headers
    )
    assert seats.status_code == 201, seats.text
    csv_bytes = next(
        data for (_bucket, key), data in storage.objects.items() if key.endswith(".csv")
    )
    codes = [line.split(",")[1] for line in csv_bytes.decode().strip().splitlines()[1:]]

    # Redeem only the seats the load actually drives; Argon2id verification is
    # deliberately expensive and redeeming all eighty would dominate setup
    # without changing what is measured.
    #
    # Each redemption comes from its own address, because the redemption
    # limiter is 10 attempts per IP per hour (backend guide 7.1) and a class
    # redeeming from one IP would be throttled by design. Discovering that the
    # limiter bites here is the harness working: it is the control doing its
    # job, not an obstacle to route around, so the load models the real shape
    # (students on their own devices) rather than disabling it.
    tokens: list[str] = []
    for index, code in enumerate(codes[:CONCURRENT_SEATS]):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(
                app=app, client=(f"198.51.100.{index + 1}", 40000 + index)
            ),
            base_url="http://loadtest",
        ) as seat_client:
            redeemed = await seat_client.post("/api/v1/seats/redeem", json={"code": code})
        assert redeemed.status_code == 200, redeemed.text
        tokens.append(str(redeemed.json()["token"]))

    seed_course_content(data_dir, course_id)
    return course_id, tokens


async def seat_session(
    client: httpx.AsyncClient,
    timings: Timings,
    course_id: int,
    token: str,
    rng: random.Random,
) -> None:
    """One seat's deadline night: read the course, pick a problem, pull a
    variant, check the mastery picture, and submit. Reads outnumber writes the
    way they do in the real loop."""
    headers = {"Authorization": f"Bearer {token}"}
    for _ in range(ROUNDS_PER_SEAT):
        await timed(
            timings,
            "read",
            partial(
                client.get, f"/api/v1/courses/{course_id}/case-studies?limit=20", headers=headers
            ),
        )
        case_id = rng.randrange(1, 51)
        await timed(
            timings,
            "read",
            partial(
                client.get, f"/api/v1/courses/{course_id}/case-studies/{case_id}", headers=headers
            ),
        )
        await timed(
            timings,
            "read",
            partial(
                client.get,
                f"/api/v1/courses/{course_id}/case-studies/{case_id}/practice-variant",
                headers=headers,
            ),
        )
        await timed(
            timings,
            "read",
            partial(client.get, f"/api/v1/courses/{course_id}/mastery", headers=headers),
        )
        await timed(
            timings,
            "read",
            partial(client.get, f"/api/v1/courses/{course_id}/history", headers=headers),
        )

        # The write burst: request upload targets, then complete the manifest.
        variant_id = case_id * 10
        created = await timed(
            timings,
            "write",
            partial(
                client.post,
                f"/api/v1/variants/{variant_id}/submissions",
                json={"pages": [{"content_type": "image/jpeg", "size_bytes": 2 * MB}]},
                headers=headers,
            ),
        )
        if created.status_code != 201:
            continue
        submission_id = int(created.json()["submission_id"])
        await timed(
            timings,
            "write",
            partial(
                client.post,
                f"/api/v1/submissions/{submission_id}/complete",
                headers=headers,
            ),
        )
        await timed(
            timings,
            "read",
            partial(client.get, f"/api/v1/submissions/{submission_id}", headers=headers),
        )


@pytest.fixture()
async def loaded_app(tmp_path: Path) -> AsyncIterator[tuple[httpx.AsyncClient, Any]]:
    storage = FakeObjectStorage()
    app = create_app(data_dir=tmp_path, jwt_secret="load-test-secret-0123456789")
    app.dependency_overrides[get_object_storage] = lambda: storage
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://loadtest") as client:
            yield client, (storage, tmp_path, app)


async def test_deadline_night_holds_the_p95_budgets(
    loaded_app: tuple[httpx.AsyncClient, Any],
) -> None:
    """The 9.1 gate: an 80-seat course under concurrent deadline-night traffic
    stays inside the guide's read and write budgets."""
    client, (storage, data_dir, app) = loaded_app
    course_id, tokens = await build_world(client, storage, data_dir, app)

    timings = Timings()
    await asyncio.gather(
        *(
            seat_session(client, timings, course_id, token, random.Random(index))
            for index, token in enumerate(tokens)
        )
    )

    print("\n" + timings.report("reads", timings.reads, READ_BUDGET_MS))
    print(timings.report("writes", timings.writes, WRITE_BUDGET_MS))

    # Every request must have done real work. A 404 is fast, so a load run full
    # of them would report a flattering p95 while measuring nothing; this is
    # what stops the gate passing vacuously.
    assert all(200 <= status < 300 for status in timings.statuses), sorted(
        {s for s in timings.statuses if not 200 <= s < 300}
    )
    assert len(timings.reads) == CONCURRENT_SEATS * ROUNDS_PER_SEAT * 6
    assert len(timings.writes) == CONCURRENT_SEATS * ROUNDS_PER_SEAT * 2

    read_p95 = timings.p95(timings.reads) * 1000
    write_p95 = timings.p95(timings.writes) * 1000
    assert read_p95 < READ_BUDGET_MS, timings.report("reads", timings.reads, READ_BUDGET_MS)
    assert write_p95 < WRITE_BUDGET_MS, timings.report("writes", timings.writes, WRITE_BUDGET_MS)


async def test_the_write_queue_serializes_without_starving_reads(
    loaded_app: tuple[httpx.AsyncClient, Any],
) -> None:
    """The single-writer design is the thing most likely to fail under load, so
    it gets its own assertion: with every seat writing at once, reads must still
    come back inside their own budget rather than queueing behind the writer."""
    client, (storage, data_dir, app) = loaded_app
    course_id, tokens = await build_world(client, storage, data_dir, app)
    timings = Timings()

    async def writer(token: str) -> None:
        headers = {"Authorization": f"Bearer {token}"}
        for _ in range(4):
            await timed(
                timings,
                "write",
                partial(
                    client.post,
                    "/api/v1/variants/10/submissions",
                    json={"pages": [{"content_type": "image/jpeg", "size_bytes": MB}]},
                    headers=headers,
                ),
            )

    async def reader(token: str) -> None:
        headers = {"Authorization": f"Bearer {token}"}
        for _ in range(8):
            await timed(
                timings,
                "read",
                partial(
                    client.get,
                    f"/api/v1/courses/{course_id}/case-studies?limit=20",
                    headers=headers,
                ),
            )

    await asyncio.gather(
        *(writer(token) for token in tokens),
        *(reader(token) for token in tokens),
    )

    print("\n" + timings.report("reads under write load", timings.reads, READ_BUDGET_MS))
    print(timings.report("writes under write load", timings.writes, WRITE_BUDGET_MS))
    assert all(200 <= status < 300 for status in timings.statuses)
    assert timings.p95(timings.reads) * 1000 < READ_BUDGET_MS, timings.report(
        "reads under write load", timings.reads, READ_BUDGET_MS
    )


def test_the_fixture_course_is_the_size_the_guide_specifies(tmp_path: Path) -> None:
    """The load is only meaningful against a realistic shard, so the shape of
    the fixture is pinned here rather than assumed."""
    shard = build_course_shard(tmp_path / "course.db")
    conn = connect(shard)
    try:
        counts = {
            table: int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
            for table in ("case_studies", "variants", "submissions")
        }
    finally:
        conn.close()

    assert counts["case_studies"] == 50
    assert counts["submissions"] == 500
    assert counts["variants"] == 100
    assert SEATS == 80


def test_sqlite_row_reads_do_not_scan(tmp_path: Path) -> None:
    """A p95 that passes today because the shard is small would fail on a real
    term's data, so the read path's plan is asserted, not just its clock: the
    hot lookups use indexes rather than table scans."""
    shard = build_course_shard(tmp_path / "course.db")
    conn = connect(shard)
    try:
        plans = {
            "submission by id": conn.execute(
                "EXPLAIN QUERY PLAN SELECT * FROM submissions WHERE id = 1"
            ).fetchall(),
            "variants by case study": conn.execute(
                "EXPLAIN QUERY PLAN SELECT id FROM variants WHERE case_study_id = 1"
            ).fetchall(),
        }
    finally:
        conn.close()

    for name, plan in plans.items():
        detail = " ".join(str(row[-1]) for row in plan)
        assert "SCAN" not in detail.upper(), f"{name} scans: {detail}"
