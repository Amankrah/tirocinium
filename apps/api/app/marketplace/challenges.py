"""Project challenges and the selections students commit to them (decision
0112).

A brief used to be a shortlist with a title: a student opened it and was
handed the families in contention and eight SKUs before doing anything, which
is the selection exercise done for them. A challenge is the exercise. It
states what the part has to do, under what constraints, and what is to be
delivered, and nothing else on first view. The student narrows the catalogue
themselves, weights the criteria in the matrix, prices a basket, and commits
the three together as a selection. Only then is the author's shortlist shown,
as a self-check rather than a hint, the way the unfold reveals a reference
solution only once the work has been done (decision 0049).

Two kinds of challenge share one shape. The catalogue's briefs are the seeded
library, the same for every course that quotes against that catalogue. A
course's own challenges are the professor's content, kept in the course shard
and written through the authoring surface or the course pack, and a seat sees
only the published ones. A selection names its challenge by a key that works
for both, and the seat's course shard holds it either way.
"""

import hashlib
import json
import sqlite3
from dataclasses import dataclass
from typing import Literal, cast

from pydantic import BaseModel, Field

from app.compression import compress_bytes, decompress_bytes
from app.marketplace.catalogue import Brief, Catalogue, Requirement
from app.marketplace.listing import LineSummary, line_summary
from app.marketplace.matrix import (
    CRITERION_KEYS,
    MAX_CANDIDATES,
    MAX_WEIGHT,
    MIN_CANDIDATES,
    MatrixOut,
    Weights,
    score_matrix,
)
from app.marketplace.quoting import (
    MAX_LINES,
    ComputedLine,
    QuoteLineIn,
    QuoteTotals,
    compute_quote,
)

Source = Literal["catalogue", "course"]
Status = Literal["draft", "published"]

MAX_REQUIREMENTS = 12
MAX_CONSTRAINTS = 8
MAX_SHORTLIST = 20

DEFAULT_DELIVERABLE = (
    "A justified material selection: your candidates, the weighting you argued "
    "from, the scored matrix, and a quotation for the chosen line."
)


# ------------------------------------------------------------------ shapes


class CriterionOut(BaseModel):
    key: str
    label: str
    group: str
    better: str


class ChallengeSummary(BaseModel):
    key: str
    source: Source
    title: str
    requirement_count: int
    # Whether this seat has committed a selection, and which, so an upload can
    # offer it for citation.
    committed: bool
    reference: str | None
    selection_id: int | None


class SelectionOut(BaseModel):
    """What the student committed, read back exactly as stored: the matrix and
    the quotation are snapshots, never recomputed, so the figures a defence
    presses on are the figures the student saw."""

    id: int
    reference: str
    candidates: list[str]
    weights: dict[str, int]
    matrix: MatrixOut
    lines: list[ComputedLine]
    totals: QuoteTotals
    notices: list[str]
    committed_at: int
    first_committed_at: int


class RevealOut(BaseModel):
    """The author's answer, shown only after a commit: the families they had
    in contention, the lines they would have put on the table, and which of
    the student's candidates were among them. Agreement is reported, never
    graded: a different shortlist with a better argument is a better report."""

    candidate_families: str
    shortlist: list[LineSummary]
    agreement: list[str]


class ChallengeOut(BaseModel):
    key: str
    source: Source
    title: str
    context: str
    requirements: list[Requirement]
    constraints: list[str]
    deliverable: str
    # The author's suggested weighting, a starting point the student edits.
    weights: dict[str, int]
    criteria: list[CriterionOut]
    selection: SelectionOut | None
    reveal: RevealOut | None


class SelectionIn(BaseModel):
    candidates: list[str] = Field(min_length=MIN_CANDIDATES, max_length=MAX_CANDIDATES)
    weights: dict[str, int] = Field(default_factory=dict)
    lines: list[QuoteLineIn] = Field(min_length=1, max_length=MAX_LINES)


class MatrixIn(BaseModel):
    skus: list[str] = Field(min_length=MIN_CANDIDATES, max_length=MAX_CANDIDATES)
    weights: dict[str, int] = Field(default_factory=dict)


# ------------------------------------------------------ the professor's


class ChallengeIn(BaseModel):
    """A challenge as the professor writes it. Weights are a suggestion over
    the matrix criteria; the shortlist is the answer the reveal shows and may
    be empty for a challenge whose author has no answer to show."""

    title: str = Field(min_length=1, max_length=200)
    context: str = Field(default="", max_length=4000)
    requirements: list[Requirement] = Field(default_factory=list, max_length=MAX_REQUIREMENTS)
    constraints: list[str] = Field(default_factory=list, max_length=MAX_CONSTRAINTS)
    deliverable: str = Field(default="", max_length=1500)
    weights: dict[str, int] = Field(default_factory=dict)
    candidate_families: str = Field(default="", max_length=400)
    shortlist: list[str] = Field(default_factory=list, max_length=MAX_SHORTLIST)
    status: Status = "draft"


class CourseChallengeOut(ChallengeIn):
    id: int
    key: str
    created_at: int
    updated_at: int
    # How many seats have committed a selection, which is what a professor
    # reads before editing a challenge students are already working.
    selection_count: int


def validate_weights(weights: dict[str, int]) -> dict[str, int]:
    """Weights as stored: known criteria only, 0 to 5, zeros dropped."""
    for key, weight in weights.items():
        if key not in CRITERION_KEYS:
            raise ValueError(f"{key} is not a matrix criterion")
        if not 0 <= weight <= MAX_WEIGHT:
            raise ValueError(f"a weight is 0 to {MAX_WEIGHT}, not {weight}")
    return {key: weight for key, weight in weights.items() if weight}


# ----------------------------------------------------- the definitions


@dataclass(frozen=True)
class ChallengeDef:
    """One challenge, whichever side it came from, as the student surface
    reads it. The answer half (families and shortlist) rides along and is
    shown only through the reveal."""

    key: str
    source: Source
    title: str
    context: str
    requirements: list[Requirement]
    constraints: list[str]
    deliverable: str
    weights: dict[str, int]
    candidate_families: str
    shortlist: list[str]


def brief_key(catalogue: Catalogue, brief: Brief) -> str:
    """A catalogue brief's key names the catalogue and the brief, never the
    version: a selection committed against one revision stays attached to the
    brief when the catalogue moves, since its figures are snapshotted."""
    return f"brief:{catalogue.id}:{brief.id}"


def course_key(challenge_id: int) -> str:
    return f"course:{challenge_id}"


def brief_challenge(catalogue: Catalogue, brief: Brief) -> ChallengeDef:
    """A brief as a challenge. A brief from before v3 has no requirements
    statement, so its selection factors stand in as the requirements and the
    deliverable is the standard one; the families and shortlist are still
    withheld until the reveal, because handing them over was the fault."""
    requirements = brief.requirements or [
        Requirement(text=factor) for factor in brief.selection_factors
    ]
    return ChallengeDef(
        key=brief_key(catalogue, brief),
        source="catalogue",
        title=brief.title,
        context=brief.context,
        requirements=requirements,
        constraints=brief.constraints,
        deliverable=brief.deliverable or DEFAULT_DELIVERABLE,
        weights=dict(brief.weights),
        candidate_families=brief.candidate_families,
        shortlist=list(brief.shortlist),
    )


_CHALLENGE_COLUMNS = (
    "id, title, context, requirements_json, constraints_json, deliverable,"
    " weights_json, candidate_families, shortlist_json, status, created_at, updated_at"
)


def _row_to_def(row: sqlite3.Row | tuple[object, ...]) -> ChallengeDef:
    return ChallengeDef(
        key=course_key(int(str(row[0]))),
        source="course",
        title=str(row[1]),
        context=str(row[2]),
        requirements=[Requirement.model_validate(r) for r in json.loads(str(row[3]))],
        constraints=[str(c) for c in json.loads(str(row[4]))],
        deliverable=str(row[5]) or DEFAULT_DELIVERABLE,
        weights={str(k): int(v) for k, v in json.loads(str(row[6])).items()},
        candidate_families=str(row[7]),
        shortlist=[str(s) for s in json.loads(str(row[8]))],
    )


def published_course_challenges(conn: sqlite3.Connection) -> list[ChallengeDef]:
    rows = conn.execute(
        f"SELECT {_CHALLENGE_COLUMNS} FROM challenges WHERE status = 'published' ORDER BY id"
    ).fetchall()
    return [_row_to_def(row) for row in rows]


def course_challenge(conn: sqlite3.Connection, challenge_id: int) -> ChallengeDef | None:
    row = conn.execute(
        f"SELECT {_CHALLENGE_COLUMNS} FROM challenges WHERE id = ? AND status = 'published'",
        (challenge_id,),
    ).fetchone()
    return _row_to_def(row) if row is not None else None


def course_challenge_out(conn: sqlite3.Connection, row: tuple[object, ...]) -> CourseChallengeOut:
    """A stored challenge as the professor reads it, with the commit count."""
    challenge_id = int(str(row[0]))
    count = conn.execute(
        "SELECT COUNT(*) FROM challenge_selections WHERE challenge_key = ?",
        (course_key(challenge_id),),
    ).fetchone()
    return CourseChallengeOut(
        id=challenge_id,
        key=course_key(challenge_id),
        title=str(row[1]),
        context=str(row[2]),
        requirements=[Requirement.model_validate(r) for r in json.loads(str(row[3]))],
        constraints=[str(c) for c in json.loads(str(row[4]))],
        deliverable=str(row[5]),
        weights={str(k): int(v) for k, v in json.loads(str(row[6])).items()},
        candidate_families=str(row[7]),
        shortlist=[str(s) for s in json.loads(str(row[8]))],
        status="published" if str(row[9]) == "published" else "draft",
        created_at=int(str(row[10])),
        updated_at=int(str(row[11])),
        selection_count=int(count[0]) if count else 0,
    )


def list_course_challenges(conn: sqlite3.Connection) -> list[CourseChallengeOut]:
    rows = conn.execute(f"SELECT {_CHALLENGE_COLUMNS} FROM challenges ORDER BY id").fetchall()
    return [course_challenge_out(conn, tuple(row)) for row in rows]


def read_course_challenge(conn: sqlite3.Connection, challenge_id: int) -> CourseChallengeOut | None:
    row = conn.execute(
        f"SELECT {_CHALLENGE_COLUMNS} FROM challenges WHERE id = ?", (challenge_id,)
    ).fetchone()
    return course_challenge_out(conn, tuple(row)) if row is not None else None


def write_course_challenge(
    conn: sqlite3.Connection,
    body: ChallengeIn,
    now: int,
    *,
    challenge_id: int | None = None,
) -> int:
    """Insert or update a professor's challenge; returns its id. The caller
    owns the transaction and has validated the shortlist against the
    catalogue."""
    weights = validate_weights(body.weights)
    values = (
        body.title,
        body.context,
        json.dumps([r.model_dump() for r in body.requirements]),
        json.dumps(body.constraints),
        body.deliverable,
        json.dumps(weights),
        body.candidate_families,
        json.dumps(body.shortlist),
        body.status,
        now,
    )
    if challenge_id is None:
        cursor = conn.execute(
            "INSERT INTO challenges (title, context, requirements_json, constraints_json,"
            " deliverable, weights_json, candidate_families, shortlist_json, status,"
            " updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (*values, now),
        )
        assert cursor.lastrowid is not None
        return int(cursor.lastrowid)
    conn.execute(
        "UPDATE challenges SET title = ?, context = ?, requirements_json = ?,"
        " constraints_json = ?, deliverable = ?, weights_json = ?, candidate_families = ?,"
        " shortlist_json = ?, status = ?, updated_at = ? WHERE id = ?",
        (*values, challenge_id),
    )
    return challenge_id


# ------------------------------------------------------- the selection


@dataclass(frozen=True)
class StoredSelection:
    id: int
    reference: str
    candidates: list[str]
    weights: dict[str, int]
    matrix: MatrixOut
    basket: list[QuoteLineIn]
    lines: list[ComputedLine]
    totals: QuoteTotals
    notices: list[str]
    committed_at: int
    first_committed_at: int

    def out(self) -> SelectionOut:
        return SelectionOut(
            id=self.id,
            reference=self.reference,
            candidates=self.candidates,
            weights=self.weights,
            matrix=self.matrix,
            lines=self.lines,
            totals=self.totals,
            notices=self.notices,
            committed_at=self.committed_at,
            first_committed_at=self.first_committed_at,
        )


def _selection_from_row(row: tuple[object, ...]) -> StoredSelection:
    quote = json.loads(decompress_bytes(cast(bytes, row[8])))
    return StoredSelection(
        id=int(str(row[0])),
        reference=str(row[1]),
        candidates=[str(s) for s in json.loads(str(row[2]))],
        weights={str(k): int(v) for k, v in json.loads(str(row[3])).items()},
        matrix=MatrixOut.model_validate(json.loads(decompress_bytes(cast(bytes, row[4])))),
        basket=[QuoteLineIn.model_validate(line) for line in json.loads(str(row[5]))],
        lines=[ComputedLine.model_validate(line) for line in quote["lines"]],
        totals=QuoteTotals.model_validate(quote["totals"]),
        notices=[str(n) for n in quote["notices"]],
        committed_at=int(str(row[6])),
        first_committed_at=int(str(row[7])),
    )


_SELECTION_COLUMNS = (
    "id, reference, candidates_json, weights_json, matrix_json_z, basket_json,"
    " committed_at, first_committed_at, quote_json_z"
)


def read_selection(conn: sqlite3.Connection, seat_id: int, key: str) -> StoredSelection | None:
    row = conn.execute(
        f"SELECT {_SELECTION_COLUMNS} FROM challenge_selections"
        " WHERE seat_id = ? AND challenge_key = ?",
        (seat_id, key),
    ).fetchone()
    return _selection_from_row(tuple(row)) if row is not None else None


def read_selection_by_id(
    conn: sqlite3.Connection, seat_id: int, selection_id: int
) -> StoredSelection | None:
    row = conn.execute(
        f"SELECT {_SELECTION_COLUMNS} FROM challenge_selections WHERE id = ? AND seat_id = ?",
        (selection_id, seat_id),
    ).fetchone()
    return _selection_from_row(tuple(row)) if row is not None else None


def committed_keys(conn: sqlite3.Connection, seat_id: int) -> dict[str, tuple[str, int]]:
    """Every challenge this seat has committed to: key to (reference, id)."""
    return {
        str(row[0]): (str(row[1]), int(row[2]))
        for row in conn.execute(
            "SELECT challenge_key, reference, id FROM challenge_selections WHERE seat_id = ?",
            (seat_id,),
        ).fetchall()
    }


def _reference(catalogue: Catalogue, key: str, seat_id: int, basket: list[QuoteLineIn]) -> str:
    digest = hashlib.sha256(
        f"{catalogue.id}:{catalogue.version}:{key}:{seat_id}:"
        f"{json.dumps([line.model_dump() for line in basket], sort_keys=True)}".encode()
    )
    prefix = catalogue.id.split("-")[0].upper()
    return f"{prefix}-SEL-{digest.hexdigest()[:6].upper()}"


def commit_selection(
    conn: sqlite3.Connection,
    catalogue: Catalogue,
    prices: dict[str, int],
    *,
    seat_id: int,
    key: str,
    body: SelectionIn,
    now: int,
) -> StoredSelection:
    """Score, price and store the selection in one transaction the caller
    owns. A recommit replaces the stored work and keeps the first commit's
    time, because the reveal was earned once and is not un-earned by
    revising."""
    matrix = score_matrix(catalogue, prices, body.candidates, Weights(values=body.weights))
    quote = compute_quote(catalogue, prices, body.lines)
    if not quote.lines:
        raise ValueError("nothing in the basket is a line this catalogue stocks")
    reference = _reference(catalogue, key, seat_id, body.lines)
    quote_blob = compress_bytes(quote.model_dump_json().encode("utf-8"))
    matrix_blob = compress_bytes(matrix.model_dump_json().encode("utf-8"))
    conn.execute(
        "INSERT INTO challenge_selections (seat_id, challenge_key, reference,"
        " candidates_json, weights_json, matrix_json_z, basket_json, quote_json_z,"
        " committed_at, first_committed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        " ON CONFLICT(seat_id, challenge_key) DO UPDATE SET"
        "   reference = excluded.reference, candidates_json = excluded.candidates_json,"
        "   weights_json = excluded.weights_json, matrix_json_z = excluded.matrix_json_z,"
        "   basket_json = excluded.basket_json, quote_json_z = excluded.quote_json_z,"
        "   committed_at = excluded.committed_at",
        (
            seat_id,
            key,
            reference,
            json.dumps(matrix.skus),
            json.dumps(matrix.weights),
            matrix_blob,
            json.dumps([line.model_dump() for line in body.lines]),
            quote_blob,
            now,
            now,
        ),
    )
    stored = read_selection(conn, seat_id, key)
    assert stored is not None
    return stored


def challenge_out(
    catalogue: Catalogue,
    prices: dict[str, int],
    definition: ChallengeDef,
    selection: StoredSelection | None,
) -> ChallengeOut:
    """The challenge as a seat reads it. The reveal exists only with a
    selection, and only when the author left an answer to show."""
    from app.marketplace.matrix import criteria_out

    reveal: RevealOut | None = None
    if selection is not None and (definition.shortlist or definition.candidate_families):
        stocked = [sku for sku in definition.shortlist if catalogue.line(sku) is not None]
        reveal = RevealOut(
            candidate_families=definition.candidate_families,
            shortlist=[
                line_summary(catalogue, prices, catalogue.line(sku))  # type: ignore[arg-type]
                for sku in stocked
            ],
            agreement=[sku for sku in selection.candidates if sku in stocked],
        )
    return ChallengeOut(
        key=definition.key,
        source=definition.source,
        title=definition.title,
        context=definition.context,
        requirements=definition.requirements,
        constraints=definition.constraints,
        deliverable=definition.deliverable,
        weights=definition.weights,
        criteria=[CriterionOut.model_validate(c) for c in criteria_out()],
        selection=selection.out() if selection else None,
        reveal=reveal,
    )


def render_selection(definition_title: str, selection: StoredSelection) -> str:
    """The selection as the tutor reads it (decision 0112): the challenge,
    the candidates and weighting, the scores, and the quotation, all from the
    stored snapshot so the defence presses on the figures the student saw."""

    def money(cents: int) -> str:
        return f"${cents / 100:,.2f}"

    lines = [f"Selection {selection.reference} for the project challenge: {definition_title}"]
    lines.append("Candidates: " + ", ".join(selection.candidates))
    lines.append(
        "Weights (0 to 5): "
        + ", ".join(f"{key} {weight}" for key, weight in selection.weights.items())
    )
    for score in sorted(selection.matrix.scores, key=lambda s: s.rank):
        gap = f" (no figure for {', '.join(score.missing)})" if score.missing else ""
        lines.append(f"- rank {score.rank}: {score.sku}, {score.score:g} % of best{gap}")
    lines.append("Quotation at list prices:")
    for line in selection.lines:
        shown = int(line.quantity) if line.quantity == int(line.quantity) else line.quantity
        lines.append(
            f"- {line.name} ({line.spec}): {shown} {line.unit_label} at"
            f" {money(line.unit_price_cents)}, {money(line.extended_cents)}"
        )
    t = selection.totals
    lines.append(
        f"Freight {money(t.freight_cents)}, tax {money(t.tax_cents)},"
        f" total {money(t.total_cents)} for {t.total_mass_grams / 1000:g} kg."
    )
    return "\n".join(lines)
