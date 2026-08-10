"""Course reporting and the two product-health dashboards (milestone 8.3).

Four professor-and-owner lenses on rows the pipelines already write, all nested
under the course like every other professor surface:

- `/reports/activity`: what each seat has done, by seat number. The seats panel
  (4.0b) shows the same counts for credential lifecycle reasons; this is the
  teaching lens, and it lists every seat including the silent ones, because a
  seat at zero is exactly what a professor opens this to find.
- `/reports/usage`: token and speech spend per course (guide 6.4 and 6.5).
- `/reports/health`: the two product-health metrics named in guide section 8,
  recognition confidence distribution and variant verification pass rate.
- `/reports/rubric-agreement`: the mastery spec's section 10 calibration loop,
  the tutor's closing verdict tracked against the professor's grade on the same
  submission, so drift toward generosity shows up instead of being assumed away.

Two rules run through all of them. Aggregates are still student data, so seat
numbers are the only identifier anywhere and there is no per-seat ranking view
(mastery spec section 6): activity is ordered by seat number, never by volume.
And an empty denominator reports null, never a zero that reads like a finding.
"""

import json
import math
import sqlite3
import time
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth.deps import get_shards, require_professor
from app.auth.models import Identity
from app.courses.routes import ensure_course_owner
from app.db.shards import ShardManager
from app.problems import Problem
from app.reports.pricing import Rates, load_rates

router = APIRouter(prefix="/api/v1/courses/{course_id}/reports", tags=["reports"])

BUCKET_COUNT = 10
RUBRIC_MAX = 3.0


# ------------------------------------------------------------------- activity


class SeatActivity(BaseModel):
    seat_number: str
    status: str
    last_used_at: int | None
    submissions: int
    graded: int
    defences: int
    last_submitted_at: int | None


class ActivityOut(BaseModel):
    seat_count: int
    active_seats: int
    total_submissions: int
    seats: list[SeatActivity]


@router.get(
    "/activity",
    response_model=ActivityOut,
    responses={401: {"model": Problem}, 403: {"model": Problem}, 404: {"model": Problem}},
)
async def activity_report(
    course_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> ActivityOut:
    """Activity by seat number. Every seat appears, ordered by number: the
    order is the roster's, not a leaderboard's."""
    await ensure_course_owner(shards, course_id, identity)

    def seats(conn: sqlite3.Connection) -> list[tuple[int, str, str, int | None]]:
        rows = conn.execute(
            "SELECT id, seat_number, status, last_used_at FROM seats"
            " WHERE course_id = ? ORDER BY seat_number",
            (course_id,),
        ).fetchall()
        return [
            (int(r[0]), str(r[1]), str(r[2]), None if r[3] is None else int(r[3]))
            for r in rows
        ]

    def counts(
        conn: sqlite3.Connection,
    ) -> tuple[dict[int, tuple[int, int, int]], dict[int, int]]:
        submissions = {
            int(r[0]): (int(r[1]), int(r[2]), int(r[3]) if r[3] is not None else 0)
            for r in conn.execute(
                "SELECT seat_id, COUNT(*), SUM(CASE WHEN grade IS NOT NULL THEN 1 ELSE 0 END),"
                " MAX(submitted_at) FROM submissions GROUP BY seat_id"
            ).fetchall()
        }
        defences = {
            int(r[0]): int(r[1])
            for r in conn.execute(
                "SELECT seat_id, COUNT(*) FROM conversations GROUP BY seat_id"
            ).fetchall()
        }
        return submissions, defences

    # Seats live in the directory and their work in the shard, so the two reads
    # are joined here, never in SQL.
    roster = await shards.directory_reads.run(seats)
    submissions, defences = await shards.course_reads(course_id).run(counts)

    rows = [
        SeatActivity(
            seat_number=seat_number,
            status=status,
            last_used_at=last_used_at,
            submissions=submissions.get(seat_id, (0, 0, 0))[0],
            graded=submissions.get(seat_id, (0, 0, 0))[1],
            defences=defences.get(seat_id, 0),
            last_submitted_at=submissions.get(seat_id, (0, 0, 0))[2] or None,
        )
        for seat_id, seat_number, status, last_used_at in roster
    ]
    return ActivityOut(
        seat_count=len(rows),
        active_seats=sum(1 for r in rows if r.status == "active"),
        total_submissions=sum(r.submissions for r in rows),
        seats=rows,
    )


# ---------------------------------------------------------------------- usage


class TokenUsageRow(BaseModel):
    kind: str
    model_id: str
    calls: int
    input_tokens: int
    output_tokens: int
    cost: float | None


class SpeechUsageRow(BaseModel):
    kind: str
    provider: str
    unit: str
    calls: int
    amount: float
    cost: float | None


class UsageOut(BaseModel):
    """Spend on this course. `priced` is false when no rates are configured,
    in which case every cost is null and the usage still stands on its own."""

    since: int | None
    priced: bool
    total_input_tokens: int
    total_output_tokens: int
    total_cost: float | None
    tokens: list[TokenUsageRow]
    speech: list[SpeechUsageRow]


def _sum_costs(costs: list[float | None]) -> float | None:
    """Total only what is actually priced; nothing priced means no total."""
    known = [c for c in costs if c is not None]
    return sum(known) if known else None


@router.get(
    "/usage",
    response_model=UsageOut,
    responses={401: {"model": Problem}, 403: {"model": Problem}, 404: {"model": Problem}},
)
async def usage_report(
    course_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
    since: int | None = None,
) -> UsageOut:
    """Token and speech usage per course, optionally since a Unix timestamp,
    grouped by caller and model. Speech is reported in its own units because
    it is billed in them, and it dominates the cost of a defence."""
    await ensure_course_owner(shards, course_id, identity)
    rates: Rates = load_rates()
    after = since if since is not None else 0

    def read(
        conn: sqlite3.Connection,
    ) -> tuple[list[tuple[str, str, int, int, int]], list[tuple[str, str, str, int, float]]]:
        tokens = [
            (str(r[0]), str(r[1]), int(r[2]), int(r[3]), int(r[4]))
            for r in conn.execute(
                "SELECT kind, model_id, COUNT(*), SUM(input_tokens), SUM(output_tokens)"
                " FROM token_usage WHERE created_at >= ?"
                " GROUP BY kind, model_id ORDER BY kind, model_id",
                (after,),
            ).fetchall()
        ]
        speech = [
            (str(r[0]), str(r[1]), str(r[2]), int(r[3]), float(r[4]))
            for r in conn.execute(
                "SELECT kind, provider, unit, COUNT(*), SUM(amount)"
                " FROM speech_usage WHERE created_at >= ?"
                " GROUP BY kind, provider, unit ORDER BY kind, provider",
                (after,),
            ).fetchall()
        ]
        return tokens, speech

    token_rows, speech_rows = await shards.course_reads(course_id).run(read)

    tokens = [
        TokenUsageRow(
            kind=kind,
            model_id=model_id,
            calls=calls,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost=rates.token_cost(model_id, input_tokens, output_tokens),
        )
        for kind, model_id, calls, input_tokens, output_tokens in token_rows
    ]
    speech = [
        SpeechUsageRow(
            kind=kind,
            provider=provider,
            unit=unit,
            calls=calls,
            amount=amount,
            cost=rates.speech_cost(kind, amount),
        )
        for kind, provider, unit, calls, amount in speech_rows
    ]
    return UsageOut(
        since=since,
        priced=rates.configured,
        total_input_tokens=sum(r.input_tokens for r in tokens),
        total_output_tokens=sum(r.output_tokens for r in tokens),
        total_cost=_sum_costs([r.cost for r in tokens] + [r.cost for r in speech]),
        tokens=tokens,
        speech=speech,
    )


# --------------------------------------------------------------------- health


class ConfidenceBucket(BaseModel):
    lower: float
    upper: float
    count: int


class RecognitionHealth(BaseModel):
    """How well the reader is reading this course's handwriting. A
    distribution, not just a mean, because the low tail is what needs acting
    on (backend guide section 8)."""

    pages_read: int
    mean_confidence: float | None
    rejected_pages: int
    buckets: list[ConfidenceBucket]


class VerificationHealth(BaseModel):
    """What share of generated variants the independent re-solve agreed with
    (guide 6.3). Manual variants are the professor's own call and belong to
    neither half of the rate, so they are counted but not divided."""

    verified: int
    flagged: int
    manual: int
    pass_rate: float | None


class HealthOut(BaseModel):
    recognition: RecognitionHealth
    verification: VerificationHealth


def _bucket_index(confidence: float) -> int:
    """Ten equal buckets over [0, 1]; a confidence of exactly 1.0 belongs to
    the top bucket rather than an eleventh."""
    return min(BUCKET_COUNT - 1, max(0, int(confidence * BUCKET_COUNT)))


@router.get(
    "/health",
    response_model=HealthOut,
    responses={401: {"model": Problem}, 403: {"model": Problem}, 404: {"model": Problem}},
)
async def health_report(
    course_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> HealthOut:
    """The two product-health metrics. These are product metrics, not
    infrastructure ones: they say whether the pipeline is serving this
    course's material well."""
    await ensure_course_owner(shards, course_id, identity)

    def read(conn: sqlite3.Connection) -> HealthOut:
        confidences = [
            float(r[0])
            for r in conn.execute(
                "SELECT pt.confidence FROM submission_pages sp"
                " JOIN page_transcriptions pt ON sp.content_sha = pt.content_hash"
                " WHERE pt.confidence IS NOT NULL"
            ).fetchall()
        ]
        rejected = int(
            conn.execute(
                "SELECT COUNT(*) FROM submission_pages WHERE quality_status = 'rejected'"
            ).fetchone()[0]
        )
        counts = {
            str(r[0]): int(r[1])
            for r in conn.execute(
                "SELECT verification, COUNT(*) FROM variants GROUP BY verification"
            ).fetchall()
        }

        tallies = [0] * BUCKET_COUNT
        for confidence in confidences:
            tallies[_bucket_index(confidence)] += 1

        verified, flagged = counts.get("verified", 0), counts.get("flagged", 0)
        judged = verified + flagged
        return HealthOut(
            recognition=RecognitionHealth(
                pages_read=len(confidences),
                mean_confidence=(
                    sum(confidences) / len(confidences) if confidences else None
                ),
                rejected_pages=rejected,
                buckets=[
                    ConfidenceBucket(
                        lower=index / BUCKET_COUNT,
                        upper=(index + 1) / BUCKET_COUNT,
                        count=count,
                    )
                    for index, count in enumerate(tallies)
                ],
            ),
            verification=VerificationHealth(
                verified=verified,
                flagged=flagged,
                manual=counts.get("manual", 0),
                pass_rate=verified / judged if judged else None,
            ),
        )

    return await shards.course_reads(course_id).run(read)


# ----------------------------------------------------------- rubric agreement


class RubricAgreementOut(BaseModel):
    """The calibration loop of mastery spec section 10. Every figure is null
    until there is something to compute it from, because a fabricated
    correlation is worse than an absent one, and this report exists precisely
    to catch the rubric drifting."""

    pairs: int
    mean_rubric_score: float | None
    mean_grade: float | None
    mean_signed_difference: float | None
    mean_absolute_difference: float | None
    correlation: float | None
    generated_at: int


def _rubric_score(rubric_json: str) -> float | None:
    """One verdict reduced to a [0,1] score: the mean of its per-concept
    reasoning anchors on the spec's 0..3 scale. A verdict that named no
    concept scores nothing rather than zero."""
    try:
        rubric = json.loads(rubric_json)
    except ValueError:
        return None
    if not isinstance(rubric, dict):
        return None
    scores = [
        float(scored["reasoning"])
        for scored in rubric.get("concepts", [])
        if isinstance(scored, dict) and isinstance(scored.get("reasoning"), int)
    ]
    if not scores:
        return None
    return sum(scores) / len(scores) / RUBRIC_MAX


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    """Pearson's r, or None when it is undefined: fewer than two points, or a
    series with no variance at all (a flat rubric against varying grades says
    nothing about correlation)."""
    n = len(xs)
    if n < 2:
        return None
    mean_x, mean_y = sum(xs) / n, sum(ys) / n
    dx = [x - mean_x for x in xs]
    dy = [y - mean_y for y in ys]
    numerator = sum(a * b for a, b in zip(dx, dy, strict=True))
    denominator = math.sqrt(sum(a * a for a in dx) * sum(b * b for b in dy))
    if denominator == 0:
        return None
    return numerator / denominator


@router.get(
    "/rubric-agreement",
    response_model=RubricAgreementOut,
    responses={401: {"model": Problem}, 403: {"model": Problem}, 404: {"model": Problem}},
)
async def rubric_agreement_report(
    course_id: int,
    identity: Annotated[Identity, Depends(require_professor)],
    shards: Annotated[ShardManager, Depends(get_shards)],
) -> RubricAgreementOut:
    """Defence rubric against professor grade, over the submissions that carry
    both. A positive signed difference means the tutor read the work more
    generously than the professor did, which is the drift the anchored prompt
    is written to resist and this report exists to watch."""
    await ensure_course_owner(shards, course_id, identity)

    def read(conn: sqlite3.Connection) -> list[tuple[float, float]]:
        rows = conn.execute(
            "SELECT c.rubric_json, s.grade FROM conversations c"
            " JOIN submissions s ON s.id = c.submission_id"
            " WHERE c.rubric_json IS NOT NULL AND s.grade IS NOT NULL"
        ).fetchall()
        pairs: list[tuple[float, float]] = []
        for rubric_json, grade in rows:
            score = _rubric_score(str(rubric_json))
            if score is not None:
                pairs.append((score, float(grade)))
        return pairs

    pairs = await shards.course_reads(course_id).run(read)
    now = int(time.time())
    if not pairs:
        return RubricAgreementOut(
            pairs=0,
            mean_rubric_score=None,
            mean_grade=None,
            mean_signed_difference=None,
            mean_absolute_difference=None,
            correlation=None,
            generated_at=now,
        )

    scores = [score for score, _ in pairs]
    grades = [grade for _, grade in pairs]
    differences = [score - grade for score, grade in pairs]
    return RubricAgreementOut(
        pairs=len(pairs),
        mean_rubric_score=sum(scores) / len(scores),
        mean_grade=sum(grades) / len(grades),
        mean_signed_difference=sum(differences) / len(differences),
        mean_absolute_difference=sum(abs(d) for d in differences) / len(differences),
        correlation=_pearson(scores, grades),
        generated_at=now,
    )
