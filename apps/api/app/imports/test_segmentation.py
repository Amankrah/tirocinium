"""Milestone 4.3 segmentation tests. The document assembled from a job's page
markdowns is segmented into staged items (question/solution pairs with figure
assignments); model calls are recorded, never live. Covers assembly, item and
item_figures storage with provenance, dropping a hallucinated figure id, the
figures-never-in-a-prompt property, and the recorded replay."""

import sqlite3
from pathlib import Path

from app.compression import compress_text, decompress_text
from app.db.shards import ShardManager
from app.imports.segmentation import (
    DEFAULT_SEGMENTATION_MODEL,
    RecordedSegmenter,
    SegmentedItem,
)
from app.imports.staging import assemble_document_for, segment_and_stage


class CapturingSegmenter:
    """Records the exact document it was shown and returns canned items, so a
    test can assert what reached the model."""

    def __init__(self, items: list[SegmentedItem]) -> None:
        self._items = list(items)
        self.document: str | None = None

    async def segment(
        self, document: str, prompt: str, *, model_id: str
    ) -> list[SegmentedItem]:
        self.document = document
        return list(self._items)


async def _seed_job(
    shards: ShardManager,
    page_markdowns: list[str],
    figure_count: int,
    *,
    course_id: int = 1,
) -> tuple[int, list[int]]:
    def create(conn: sqlite3.Connection) -> tuple[int, list[int]]:
        job = conn.execute(
            "INSERT INTO import_jobs (course_id, storage_key, status, created_at)"
            " VALUES (?, 'k', 'ready', 0)",
            (course_id,),
        )
        job_id = int(job.lastrowid or 0)
        figure_ids: list[int] = []
        for i in range(figure_count):
            cur = conn.execute(
                "INSERT INTO figures (content_hash, storage_key, source, width_px,"
                " height_px, created_at) VALUES (?, ?, 'embedded_raster', 10, 10, 0)",
                (f"figure-hash-{i}", f"figures/{i}.jpeg"),
            )
            figure_ids.append(int(cur.lastrowid or 0))
        for index, markdown in enumerate(page_markdowns):
            content_hash = f"page-hash-{index}"
            conn.execute(
                "INSERT INTO page_documents (content_hash, kind, markdown_z, decoder,"
                " created_at) VALUES (?, 'born_digital', ?, 'pdfium', 0)",
                (content_hash, compress_text(conn, "problem_text", markdown)),
            )
            conn.execute(
                "INSERT INTO import_pages (job_id, page_index, kind, image_key,"
                " content_hash) VALUES (?, ?, 'born_digital', ?, ?)",
                (job_id, index, f"img/{index}.png", content_hash),
            )
        return job_id, figure_ids

    return await shards.course(course_id).run(create)


async def test_segment_and_stage_stores_items_links_and_provenance(tmp_path: Path) -> None:
    async with ShardManager(tmp_path) as shards:
        # Two pages, the first referencing figure 1 by a fig:// token.
        job_id, figure_ids = await _seed_job(
            shards,
            [
                "# Problem 1\n\nCompute the current.\n\n![Fig 1](fig://{f0})",
                "# Problem 2\n\nFind the eigenvalues.",
            ],
            figure_count=1,
        )
        f0 = figure_ids[0]
        pages_markdown = [
            f"# Problem 1\n\nCompute the current.\n\n![Fig 1](fig://{f0})",
            "# Problem 2\n\nFind the eigenvalues.",
        ]
        # Re-seed the page markdown with the real figure id in the token.
        await shards.course(1).run(
            lambda conn: conn.execute(
                "UPDATE page_documents SET markdown_z = ? WHERE content_hash = 'page-hash-0'",
                (compress_text(conn, "problem_text", pages_markdown[0]),),
            )
        )

        segmenter = CapturingSegmenter(
            [
                SegmentedItem(
                    title="Problem 1",
                    question_md=f"Compute the current. ![Fig 1](fig://{f0})",
                    solution_md="I = V/R",
                    figure_ids=[f0, 999],  # 999 is hallucinated, must be dropped
                    page_span="0",
                    confidence=0.9,
                    notes=None,
                ),
                SegmentedItem(
                    title="Problem 2",
                    question_md="Find the eigenvalues.",
                    solution_md=None,
                    figure_ids=[],
                    page_span="1",
                    confidence=0.8,
                    notes="No solution found in the document.",
                ),
            ]
        )

        count = await segment_and_stage(
            shards=shards, segmenter=segmenter, course_id=1, job_id=job_id
        )

        def read(conn: sqlite3.Connection) -> tuple:  # type: ignore[type-arg]
            items = conn.execute(
                "SELECT id, title, question_z, solution_z, page_span, confidence, notes,"
                " model_id, prompt_version, state FROM import_items"
                " WHERE job_id = ? ORDER BY id",
                (job_id,),
            ).fetchall()
            first_q = decompress_text(conn, "problem_text", bytes(items[0][2]))
            links = conn.execute(
                "SELECT item_id, figure_id, role FROM item_figures ORDER BY item_id"
            ).fetchall()
            return items, first_q, links

        items, first_question, links = await shards.course_reads(1).run(read)

    assert count == 2
    assert len(items) == 2
    assert items[0][1] == "Problem 1"
    assert f"fig://{f0}" in first_question  # the token is preserved verbatim
    assert items[0][9] == "pending"
    assert items[0][7] == DEFAULT_SEGMENTATION_MODEL  # model_id provenance
    assert items[0][8] == "v1"  # prompt_version provenance
    assert items[1][3] is None  # no solution for item 2
    assert items[1][6] == "No solution found in the document."
    # Only the real figure is linked; the hallucinated 999 is dropped.
    assert links == [(items[0][0], f0, "essential")]
    # Figures reached the model as a fig:// token, never as bytes.
    assert segmenter.document is not None
    assert f"fig://{f0}" in segmenter.document
    assert "<!-- page 0 -->" in segmenter.document and "<!-- page 1 -->" in segmenter.document


async def test_empty_document_stages_nothing(tmp_path: Path) -> None:
    async with ShardManager(tmp_path) as shards:
        job_id, _ = await _seed_job(shards, [], figure_count=0)
        segmenter = CapturingSegmenter([])
        count = await segment_and_stage(
            shards=shards, segmenter=segmenter, course_id=1, job_id=job_id
        )
    assert count == 0
    assert segmenter.document is None  # not even called on an empty document


def test_assemble_document_marks_pages() -> None:
    document = assemble_document_for([(0, "Alpha"), (1, "Beta")])
    assert document == "<!-- page 0 -->\n\nAlpha\n\n<!-- page 1 -->\n\nBeta"


async def test_recorded_segmenter_replays_by_document_hash() -> None:
    document = "<!-- page 0 -->\n\nProblem."
    segmenter = RecordedSegmenter.for_documents(
        {document: [SegmentedItem(question_md="Problem.", page_span="0", confidence=1.0)]}
    )
    items = await segmenter.segment(document, "prompt", model_id="m")
    assert items[0].question_md == "Problem."
    assert segmenter.calls == 1
