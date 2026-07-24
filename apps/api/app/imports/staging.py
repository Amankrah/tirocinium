"""Segmentation staging (backend guide section 5 Stage 2, milestone 4.3).
Assemble an import job's decoded page markdowns into one document (page markers
and fig:// tokens intact), run the segmentation model over it, and stage the
returned items with their figure assignments. Items land 'pending' and become
case studies only when the professor confirms them (4.4): the AI proposes, the
professor disposes.

The document is text and fig:// tokens only; figure bytes never enter it. A
model-assigned figure id is linked only when it names a real figure row, so a
hallucinated id is dropped rather than dangling.
"""

import sqlite3
from collections.abc import Callable

from app.compression import compress_text, decompress_text
from app.db.shards import ShardManager
from app.imports.segmentation import (
    DEFAULT_SEGMENTATION_MODEL,
    SegmentedItem,
    Segmenter,
)
from app.prompts import Prompt, load_prompt


async def segment_and_stage(
    *,
    shards: ShardManager,
    segmenter: Segmenter,
    course_id: int,
    job_id: int,
    prompt: Prompt | None = None,
    model_id: str = DEFAULT_SEGMENTATION_MODEL,
) -> int:
    """Segment a job's document into staged items. Returns the item count (0 if
    there is nothing to segment)."""
    prompt = prompt or load_prompt("segmentation", "v1")
    pages = await shards.course_reads(course_id).run(_read_pages(job_id))
    document = _assemble(pages)
    if not document.strip():
        return 0
    items = await segmenter.segment(document, prompt.text, model_id=model_id)
    return await shards.course(course_id).run(
        _store_items(job_id, items, model_id, prompt.version)
    )


def assemble_document_for(pages: list[tuple[int, str]]) -> str:
    """Public alias for tests: assemble the marked-up document from ordered
    (page_index, markdown) pairs."""
    return _assemble(pages)


def _assemble(pages: list[tuple[int, str]]) -> str:
    return "\n\n".join(
        f"<!-- page {index} -->\n\n{markdown}" for index, markdown in pages
    )


def _read_pages(job_id: int) -> Callable[[sqlite3.Connection], list[tuple[int, str]]]:
    def read(conn: sqlite3.Connection) -> list[tuple[int, str]]:
        rows = conn.execute(
            "SELECT ip.page_index, pd.markdown_z FROM import_pages ip"
            " JOIN page_documents pd ON ip.content_hash = pd.content_hash"
            " WHERE ip.job_id = ? ORDER BY ip.page_index",
            (job_id,),
        ).fetchall()
        return [
            (int(row[0]), decompress_text(conn, "problem_text", bytes(row[1])))
            for row in rows
        ]

    return read


def _store_items(
    job_id: int, items: list[SegmentedItem], model_id: str, prompt_version: str
) -> Callable[[sqlite3.Connection], int]:
    def apply(conn: sqlite3.Connection) -> int:
        for item in items:
            solution_z = (
                None
                if item.solution_md is None
                else compress_text(conn, "problem_text", item.solution_md)
            )
            cursor = conn.execute(
                "INSERT INTO import_items"
                " (job_id, title, question_z, solution_z, page_span, confidence,"
                "  notes, model_id, prompt_version, state)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')",
                (
                    job_id,
                    item.title,
                    compress_text(conn, "problem_text", item.question_md),
                    solution_z,
                    item.page_span,
                    item.confidence,
                    item.notes,
                    model_id,
                    prompt_version,
                ),
            )
            item_id = cursor.lastrowid
            for figure_id in item.figure_ids:
                # Link only figures that exist, so a hallucinated id is dropped.
                if conn.execute(
                    "SELECT 1 FROM figures WHERE id = ?", (figure_id,)
                ).fetchone():
                    conn.execute(
                        "INSERT OR IGNORE INTO item_figures (item_id, figure_id, role)"
                        " VALUES (?, ?, 'essential')",
                        (item_id, figure_id),
                    )
        return len(items)

    return apply
