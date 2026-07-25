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
from app.imports.decoder import (
    DEFAULT_FIGURE_DETECTION_MODEL,
    ExtractedFigure,
    FigureDetector,
    PageFigures,
)
from app.prompts import Prompt, load_prompt
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
            _upsert_figure(
                content_hash,
                storage_key,
                storage_key_2x,
                figure,
                page_index,
                page_figures.page_width,
                page_figures.page_height,
            )
        )
        caption = figure.caption or ""
        placements.append((figure.bbox[1], f"![{caption}](fig://{figure_id})"))

    return _place_tokens(page_markdown, placements, page_figures.page_height)


async def detect_and_store_page_crops(
    *,
    shards: ShardManager,
    storage: ObjectStorage,
    detector: FigureDetector,
    course_id: int,
    page_index: int,
    page_image: bytes,
    page_markdown: str,
    prompt: Prompt | None = None,
    model_id: str = DEFAULT_FIGURE_DETECTION_MODEL,
) -> str:
    """The vision figure detector for a scanned page (4.3): propose figure boxes,
    crop the page raster at each (a page_crop figure, never a re-render), store
    them, and place fig:// tokens in the page markdown. Returns the markdown
    unchanged when the detector proposes nothing."""
    prompt = prompt or load_prompt("figure-detection", "v1")
    boxes = await detector.detect(page_image, prompt.text, model_id=model_id)
    if not boxes:
        return page_markdown

    from platform_core import pdf as _pdf

    page_width, page_height, regions = await asyncio.to_thread(
        _pdf.crop_figures, page_image, [box.bbox for box in boxes]
    )
    figures = [
        ExtractedFigure(
            source="page_crop",
            bbox=(float(x), float(y), float(w), float(h)),
            width_px=w,
            height_px=h,
            format="png",
            image=png,
            image_2x=None,
            caption=box.caption,
        )
        for box, (png, x, y, w, h) in zip(boxes, regions, strict=True)
    ]
    page_figures = PageFigures(
        page_width=float(page_width), page_height=float(page_height), figures=figures
    )
    return await store_figures_and_annotate(
        shards=shards,
        storage=storage,
        course_id=course_id,
        page_index=page_index,
        page_markdown=page_markdown,
        page_figures=page_figures,
    )


def normalized_bbox(
    bbox: tuple[float, float, float, float], page_width: float, page_height: float
) -> list[float]:
    """Figure bbox as fractions of the page (0..1, top-left), the one frame that
    is consistent across sources (born-digital points and page_crop pixels alike)
    and that a client can map onto a displayed page or send back to a crop verb
    without any page-dimension plumbing (decision 0032)."""
    x, y, w, h = bbox
    if page_width <= 0 or page_height <= 0:
        return [x, y, w, h]
    return [x / page_width, y / page_height, w / page_width, h / page_height]


def _upsert_figure(
    content_hash: str,
    storage_key: str,
    storage_key_2x: str | None,
    figure: ExtractedFigure,
    page_index: int,
    page_width: float,
    page_height: float,
) -> Callable[[sqlite3.Connection], int]:
    """Insert the figure row if its content is new (deduped by content_hash),
    and return its id either way. The first occurrence's page and bbox are the
    row's provenance; later identical figures reuse the row. bbox is stored
    normalised to 0..1 (decision 0032)."""
    bbox_json = json.dumps(normalized_bbox(figure.bbox, page_width, page_height))
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
