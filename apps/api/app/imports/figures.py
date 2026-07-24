"""Figure storage and fig:// placement (backend guide section 5 Stage 1b,
milestone 4.2). The deterministic detector (platform_core, behind the
FigureExtractor seam) returns a page's figures as pixels; this stores them in
object storage content-addressed (so a figure shared across imports is stored
and rowed once), records metadata only in the shard, and inserts a
`![caption](fig://{id})` token into the page markdown at the figure's position.

Figure bytes never enter a text prompt: only the fig:// token travels with the
text, and the bytes go straight to storage from here.
"""

import asyncio
import hashlib
import json
import sqlite3
import time
from collections.abc import Callable

from app.db.shards import ShardManager
from app.imports.decoder import ExtractedFigure, PageFigures
from app.storage import IMPORTS_BUCKET, ObjectStorage


async def store_figures_and_annotate(
    *,
    shards: ShardManager,
    storage: ObjectStorage,
    course_id: int,
    page_index: int,
    page_markdown: str,
    page_figures: PageFigures,
) -> str:
    """Store a page's figures and return its markdown with fig:// tokens placed.
    Returns the markdown unchanged when there are no figures."""
    if not page_figures.figures:
        return page_markdown

    writer = shards.course(course_id)
    placements: list[tuple[float, str]] = []
    for figure in page_figures.figures:
        content_hash = hashlib.sha256(figure.image).hexdigest()
        storage_key = f"imports/{course_id}/figures/{content_hash}.{figure.format}"
        await asyncio.to_thread(
            storage.put_object, Bucket=IMPORTS_BUCKET, Key=storage_key, Body=figure.image
        )
        storage_key_2x: str | None = None
        if figure.image_2x is not None:
            storage_key_2x = f"imports/{course_id}/figures/{content_hash}.2x.png"
            await asyncio.to_thread(
                storage.put_object,
                Bucket=IMPORTS_BUCKET,
                Key=storage_key_2x,
                Body=figure.image_2x,
            )
        figure_id = await writer.run(
            _upsert_figure(content_hash, storage_key, storage_key_2x, figure, page_index)
        )
        caption = figure.caption or ""
        placements.append((figure.bbox[1], f"![{caption}](fig://{figure_id})"))

    return _place_tokens(page_markdown, placements, page_figures.page_height)


def _upsert_figure(
    content_hash: str,
    storage_key: str,
    storage_key_2x: str | None,
    figure: ExtractedFigure,
    page_index: int,
) -> Callable[[sqlite3.Connection], int]:
    """Insert the figure row if its content is new (deduped by content_hash),
    and return its id either way. The first occurrence's page and bbox are the
    row's provenance; later identical figures reuse the row."""
    bbox_json = json.dumps(list(figure.bbox))
    now = int(time.time())

    def apply(conn: sqlite3.Connection) -> int:
        conn.execute(
            "INSERT OR IGNORE INTO figures"
            " (content_hash, storage_key, storage_key_2x, source, page, bbox,"
            "  width_px, height_px, caption, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                content_hash,
                storage_key,
                storage_key_2x,
                figure.source,
                page_index,
                bbox_json,
                figure.width_px,
                figure.height_px,
                figure.caption,
                now,
            ),
        )
        row = conn.execute(
            "SELECT id FROM figures WHERE content_hash = ?", (content_hash,)
        ).fetchone()
        return int(row[0])

    return apply


def _place_tokens(
    markdown: str, placements: list[tuple[float, str]], page_height: float
) -> str:
    """Insert each figure token into the page markdown at its vertical position,
    as a standalone block. Positioning is proportional (a figure a third of the
    way down the page lands about a third of the way through the text lines); the
    precise inline interleaving refines against the five-PDF corpus. When the
    page has no text, the tokens stand alone in reading order."""
    ordered = sorted(placements, key=lambda item: item[0])
    lines = markdown.split("\n") if markdown.strip() else []
    if not lines:
        return "\n\n".join(token for _, token in ordered)

    count = len(lines)
    indexed = sorted(
        (
            (_line_index(y, page_height, count), token)
            for y, token in placements
        ),
        key=lambda item: item[0],
    )
    out: list[str] = []
    cursor = 0
    for index, token in indexed:
        out.extend(lines[cursor:index])
        out.extend(("", token, ""))
        cursor = index
    out.extend(lines[cursor:])
    return "\n".join(out).strip()


def _line_index(y: float, page_height: float, count: int) -> int:
    if page_height <= 0:
        return count
    fraction = y / page_height
    return min(count, max(0, round(fraction * count)))
