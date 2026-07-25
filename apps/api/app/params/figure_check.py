"""The figure-frozen check (backend guide 6.1, milestone 5.1). Variants
reproduce a case study's figures byte for byte, so any value visibly printed
inside an essential figure is frozen: a parameter whose base value appears in
a figure is blocked with the stated reason, because varying it would make the
text silently contradict the diagram. The professor's escape hatches are
exactly two: mark the figure decorative, or move the value into the prose.

Readings come from the vision seam in app.params.model, one call per distinct
figure ever, cached in figure_readings by content hash (migration 0013).
"""

import asyncio
import json
import re
import sqlite3
import time
from collections.abc import Callable

from pydantic import BaseModel

from app.db.shards import ShardManager
from app.params.model import (
    DEFAULT_FIGURE_READING_MODEL,
    FigureReader,
    FigureReading,
)
from app.params.schema import (
    ChoiceParameter,
    EntityParameter,
    ParamSpec,
)
from app.prompts import load_prompt
from app.storage import IMPORTS_BUCKET, ObjectStorage, fetch_bytes


class EssentialFigure(BaseModel, frozen=True):
    """One essential figure of a case study, as the frozen check needs it."""

    figure_id: int
    content_hash: str
    storage_key: str
    caption: str | None


class BlockedParameter(BaseModel, frozen=True):
    """One parameter the check refuses, with the professor-facing reason."""

    parameter: str
    figure_id: int
    value: str
    reason: str


def load_essential_figures(
    case_study_id: int,
) -> Callable[[sqlite3.Connection], list[EssentialFigure]]:
    """The case study's essential figures, via the confirmed import item that
    became it. Decorative figures are excluded by definition: marking a figure
    decorative is one of the two escape hatches."""

    def read(conn: sqlite3.Connection) -> list[EssentialFigure]:
        rows = conn.execute(
            "SELECT f.id, f.content_hash, f.storage_key, f.caption"
            " FROM figures f"
            " JOIN item_figures link ON link.figure_id = f.id"
            " JOIN import_items item ON item.id = link.item_id"
            " WHERE item.case_study_id = ? AND link.role = 'essential'"
            " ORDER BY f.id",
            (case_study_id,),
        ).fetchall()
        return [
            EssentialFigure(
                figure_id=int(r[0]),
                content_hash=str(r[1]),
                storage_key=str(r[2]),
                caption=None if r[3] is None else str(r[3]),
            )
            for r in rows
        ]

    return read


async def reading_for(
    *,
    shards: ShardManager,
    storage: ObjectStorage,
    reader: FigureReader,
    course_id: int,
    figure: EssentialFigure,
    model_id: str = DEFAULT_FIGURE_READING_MODEL,
) -> FigureReading:
    """The figure's displayed values: from the cache when the figure has been
    read before (by anyone, ever), else one vision call, cached for good."""

    def load_cached(conn: sqlite3.Connection) -> str | None:
        row = conn.execute(
            "SELECT values_json FROM figure_readings WHERE content_hash = ?",
            (figure.content_hash,),
        ).fetchone()
        return None if row is None else str(row[0])

    cached = await shards.course_reads(course_id).run(load_cached)
    if cached is not None:
        return FigureReading(values=json.loads(cached))

    prompt = load_prompt("figure-reading", "v1")
    image = await asyncio.to_thread(
        fetch_bytes, storage, IMPORTS_BUCKET, figure.storage_key
    )
    reading = await reader.read(image, prompt.text, model_id=model_id)
    now = int(time.time())

    def store(conn: sqlite3.Connection) -> None:
        conn.execute(
            "INSERT OR IGNORE INTO figure_readings"
            " (content_hash, values_json, model_id, prompt_version, created_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (
                figure.content_hash,
                json.dumps(reading.values),
                model_id,
                prompt.provenance,
                now,
            ),
        )

    await shards.course(course_id).run(store)
    return reading


_NUMBER = re.compile(r"-?\d+(?:[.,]\d+)?")


def _numbers_in(display: str) -> list[float]:
    return [float(m.replace(",", ".")) for m in _NUMBER.findall(display)]


def _numeric_match(base: float, display: str) -> bool:
    return any(
        abs(base - shown) <= 1e-9 * max(1.0, abs(base), abs(shown))
        for shown in _numbers_in(display)
    )


def _text_match(base: str, display: str) -> bool:
    return base.strip().lower() in display.lower()


def check_spec_against_figures(
    spec: ParamSpec, figures: list[tuple[EssentialFigure, FigureReading]]
) -> list[BlockedParameter]:
    """Every (parameter, figure) conflict: a number or integer whose base value
    matches a number displayed in the figure, or a choice or entity whose base
    text appears in one. The reason is the professor-facing copy, stated per
    conflict (frontend guide 3.4: honest, one job per string)."""
    blocked: list[BlockedParameter] = []
    for name, parameter in spec.parameters.items():
        for figure, reading in figures:
            for display in reading.values:
                if isinstance(parameter, (ChoiceParameter, EntityParameter)):
                    hit = _text_match(parameter.base, display)
                else:
                    hit = _numeric_match(float(parameter.base), display)
                if not hit:
                    continue
                label = figure.caption or f"figure {figure.figure_id}"
                blocked.append(
                    BlockedParameter(
                        parameter=name,
                        figure_id=figure.figure_id,
                        value=display,
                        reason=(
                            f"{display} appears in {label}, so this value"
                            " can't vary unless the figure is decorative."
                        ),
                    )
                )
                break  # one reason per (parameter, figure) pair is enough
    return blocked
