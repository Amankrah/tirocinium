"""Tirocinium mastery store: the SQLite adapter that closes the loop from
backend guide section 6.6 and mastery spec sections 2 through 5.

Responsibilities, and only these:
  - own the mastery-related tables in a course shard (concepts, mappings,
    evidence_events, mastery_state);
  - record evidence events and incrementally apply them through the Rust
    core (tirocinium_mastery), holding the cached state;
  - recompute any (seat, concept) by replay, with professor supersession,
    which is also how grades override automatic evidence;
  - answer the two product questions: the mastery view for a seat, and the
    revisit queue.

The adapter never computes model arithmetic in Python. Every number comes
from the Rust core, so the property-tested implementation is the only
implementation.

Concurrency contract: all writes go through the shard's single writer
connection (backend guide 3.2); this module assumes the caller enforces
that and therefore opens nothing itself.
"""

from __future__ import annotations

import json
import sqlite3
import time
from dataclasses import dataclass

from platform_core import mastery as _core

SCHEMA = """
CREATE TABLE IF NOT EXISTS concepts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS case_study_concepts (
  case_study_id INTEGER NOT NULL,
  concept_id INTEGER NOT NULL REFERENCES concepts(id),
  weight REAL NOT NULL CHECK (weight > 0 AND weight <= 1),
  PRIMARY KEY (case_study_id, concept_id)
);

CREATE TABLE IF NOT EXISTS evidence_events (
  id INTEGER PRIMARY KEY,
  seat_id INTEGER NOT NULL,
  concept_id INTEGER NOT NULL REFERENCES concepts(id),
  source TEXT NOT NULL CHECK (source IN
    ('professor_grade','answer_match','defense_rubric','working_assessment')),
  score REAL NOT NULL CHECK (score >= 0 AND score <= 1),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  k REAL NOT NULL CHECK (k > 0 AND k <= 1),
  ref_kind TEXT NOT NULL CHECK (ref_kind IN ('submission','conversation','grade')),
  ref_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_seat_concept
  ON evidence_events(seat_id, concept_id, created_at);
CREATE INDEX IF NOT EXISTS idx_evidence_ref
  ON evidence_events(ref_kind, ref_id);

CREATE TABLE IF NOT EXISTS mastery_state (
  seat_id INTEGER NOT NULL,
  concept_id INTEGER NOT NULL REFERENCES concepts(id),
  state_json TEXT NOT NULL,          -- opaque cache; Rust core owns the shape
  params_version TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (seat_id, concept_id)
);
"""


@dataclass(frozen=True)
class MasteryView:
    """What the API returns for one (seat, concept), spec sections 4.5 and 9."""

    concept_id: int
    label: str
    m_eff: float
    retention: float
    due_for_revisit: bool


def migrate(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)


class MasteryStore:
    def __init__(self, conn: sqlite3.Connection, params_json: str | None = None):
        self._conn = conn
        self._params = params_json or _core.default_params_json()
        self._params_version = json.loads(self._params)["version"]

    # ---------------------------------------------------------------- events

    def record_event(
        self,
        *,
        seat_id: int,
        concept_id: int,
        source: str,
        score: float,
        confidence: float,
        k: float,
        ref_kind: str,
        ref_id: int,
        at: int | None = None,
    ) -> MasteryView:
        """Insert one evidence event and incrementally apply it to the cached
        state. A professor_grade event triggers a full supersession replay
        instead of an incremental apply (spec 4.6), because it retracts
        earlier automatic events rather than merely adding to them.
        """
        at = int(at if at is not None else time.time())
        self._conn.execute(
            "INSERT INTO evidence_events"
            " (seat_id, concept_id, source, score, confidence, k, ref_kind, ref_id, created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (seat_id, concept_id, source, score, confidence, k, ref_kind, ref_id, at),
        )

        if source == "professor_grade":
            state_json = self._replay(seat_id, concept_id)
        else:
            row = self._conn.execute(
                "SELECT state_json FROM mastery_state WHERE seat_id=? AND concept_id=?",
                (seat_id, concept_id),
            ).fetchone()
            prior = row[0] if row else None
            event_json = json.dumps(
                {
                    "event": {
                        "source": source,
                        "score": score,
                        "confidence": confidence,
                        "ref_kind": ref_kind,
                        "ref_id": ref_id,
                        "at": at,
                    },
                    "k": k,
                }
            )
            state_json = _core.apply_json(prior, event_json, self._params)

        self._conn.execute(
            "INSERT INTO mastery_state"
            " (seat_id, concept_id, state_json, params_version, updated_at)"
            " VALUES (?,?,?,?,?)"
            " ON CONFLICT(seat_id, concept_id) DO UPDATE SET"
            "   state_json=excluded.state_json,"
            "   params_version=excluded.params_version,"
            "   updated_at=excluded.updated_at",
            (seat_id, concept_id, state_json, self._params_version, at),
        )
        return self._view(concept_id, state_json, now=at)

    def record_submission_evidence(
        self,
        *,
        seat_id: int,
        case_study_id: int,
        submission_id: int,
        source: str,
        score: float,
        confidence: float,
        at: int | None = None,
    ) -> list[MasteryView]:
        """Fan one submission-level observation out to every concept the case
        maps (spec section 3: one event per mapped concept, with the mapping
        weight k folded in at update time)."""
        rows = self._conn.execute(
            "SELECT concept_id, weight FROM case_study_concepts WHERE case_study_id=?",
            (case_study_id,),
        ).fetchall()
        return [
            self.record_event(
                seat_id=seat_id,
                concept_id=concept_id,
                source=source,
                score=score,
                confidence=confidence,
                k=weight,
                ref_kind="submission",
                ref_id=submission_id,
                at=at,
            )
            for concept_id, weight in rows
        ]

    # ---------------------------------------------------------------- replay

    def _event_stream_json(self, seat_id: int, concept_id: int) -> str:
        rows = self._conn.execute(
            "SELECT source, score, confidence, k, ref_kind, ref_id, created_at"
            " FROM evidence_events WHERE seat_id=? AND concept_id=?"
            " ORDER BY created_at, id",
            (seat_id, concept_id),
        ).fetchall()
        return json.dumps(
            [
                {
                    "event": {
                        "source": r[0],
                        "score": r[1],
                        "confidence": r[2],
                        "ref_kind": r[4],
                        "ref_id": r[5],
                        "at": r[6],
                    },
                    "k": r[3],
                }
                for r in rows
            ]
        )

    def _replay(self, seat_id: int, concept_id: int) -> str:
        stream = self._event_stream_json(seat_id, concept_id)
        superseded = _core.supersede_json(stream)
        state_json = _core.replay_json(superseded, self._params)
        if state_json is None:
            raise ValueError("replay of a non-empty stream returned no state")
        return state_json

    def recompute(self, seat_id: int, concept_id: int) -> MasteryView:
        """Full replay with supersession; the audit and bug-fix path."""
        now = int(time.time())
        state_json = self._replay(seat_id, concept_id)
        self._conn.execute(
            "UPDATE mastery_state SET state_json=?, params_version=?, updated_at=?"
            " WHERE seat_id=? AND concept_id=?",
            (state_json, self._params_version, now, seat_id, concept_id),
        )
        return self._view(concept_id, state_json, now=now)

    # ----------------------------------------------------------------- reads

    def _view(self, concept_id: int, state_json: str, now: int) -> MasteryView:
        v = json.loads(_core.view_json(state_json, now, self._params))
        return MasteryView(
            concept_id=concept_id,
            label=v["label"],
            m_eff=v["m_eff"],
            retention=v["retention"],
            due_for_revisit=v["due_for_revisit"],
        )

    def seat_view(self, seat_id: int, now: int | None = None) -> list[MasteryView]:
        """The student's mastery picture: one view per concept with state,
        plus implicit Unseen for concepts with no row (the caller renders
        those from the concepts table)."""
        now = int(now if now is not None else time.time())
        rows = self._conn.execute(
            "SELECT concept_id, state_json FROM mastery_state WHERE seat_id=?",
            (seat_id,),
        ).fetchall()
        return [self._view(cid, sj, now) for cid, sj in rows]

    def revisit_queue(self, seat_id: int, now: int | None = None) -> list[int]:
        """Concept ids currently due for revisit (spec section 5), most
        faded first."""
        now = int(now if now is not None else time.time())
        due = [
            (v.retention, v.concept_id)
            for v in self.seat_view(seat_id, now)
            if v.due_for_revisit
        ]
        return [cid for _, cid in sorted(due)]
