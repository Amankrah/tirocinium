"""The PDF decode pipeline (backend guide section 5 Stage 1, milestone 4.1),
run off the request path by the worker. Fetch the uploaded PDF, decode every
page (born digital via pdfium, scanned via the Phase 3 preprocess and vision
path), store each rendered page raster, and record one markdown document per
page, cached by the server-computed content hash so a re-upload costs nothing.

Figure extraction (4.2) and segmentation into items (4.3) are later stages that
read these page documents; 4.1 stops at decoded, cached page markdown. The
pipeline is a plain coroutine with its collaborators injected (storage, decoder,
transcriber, and even the preprocess function), so tests drive it with fakes and
recorded responses and never touch a live model, a real PDF, or the native
library.
"""

import asyncio
import hashlib
import sqlite3
import time
from collections.abc import Callable

from platform_core.preprocess import PageRejected
from platform_core.preprocess import preprocess as _default_preprocess

from app.compression import compress_text
from app.imports.decoder import (
    DEFAULT_PDF_DECODER,
    DecodedPage,
    FigureDetector,
    FigureExtractor,
    PdfDecoder,
)
from app.imports.figures import detect_and_store_page_crops, store_figures_and_annotate
from app.imports.segmentation import Segmenter
from app.imports.staging import segment_and_stage
from app.prompts import Prompt, load_prompt
from app.storage import IMPORTS_BUCKET, ObjectStorage, fetch_bytes
from app.transcription.model import DEFAULT_VISION_MODEL, VisionTranscriber

STATUS_PROCESSING = "processing"
STATUS_READY = "ready"
STATUS_FAILED = "failed"

# Page ceiling (backend guide section 5 Stage 1). The byte ceiling is enforced
# on the declared manifest at upload; the page count is only known after decode,
# so it is enforced here.
MAX_PDF_PAGES = 200

Preprocess = Callable[[bytes], tuple[bytes, bytes, str]]


async def run_import_pipeline(
    *,
    shards: object,
    storage: ObjectStorage,
    decoder: PdfDecoder,
    transcriber: VisionTranscriber,
    course_id: int,
    import_id: int,
    prompt: Prompt | None = None,
    preprocess: Preprocess | None = None,
    figure_extractor: FigureExtractor | None = None,
    figure_detector: FigureDetector | None = None,
    segmenter: Segmenter | None = None,
) -> str:
    """Decode one import job end to end. Returns the terminal status."""
    from app.db.shards import ShardManager

    assert isinstance(shards, ShardManager)
    prompt = prompt or load_prompt("pdf-page-transcription", "v1")
    run_preprocess: Preprocess = preprocess or _default_preprocess
    reads = shards.course_reads(course_id)
    writer = shards.course(course_id)

    storage_key = await reads.run(_read_job(import_id))
    if storage_key is None:
        return STATUS_FAILED
    prefix = storage_key.rsplit("/", 1)[0]

    await writer.run(_set_status(import_id, STATUS_PROCESSING))

    try:
        pdf_bytes = await asyncio.to_thread(
            fetch_bytes, storage, IMPORTS_BUCKET, storage_key
        )
        pages = await asyncio.to_thread(decoder.decode, pdf_bytes)
        if len(pages) > MAX_PDF_PAGES:
            raise ValueError(
                f"PDF has {len(pages)} pages, over the {MAX_PDF_PAGES} page limit"
            )

        for page in pages:
            image_key = f"{prefix}/pages/{page.page_index}.png"
            content_hash = hashlib.sha256(page.image_png).hexdigest()

            cached = await reads.run(_read_cache(content_hash))
            if cached is None:
                markdown, provenance = await _decode_page(
                    page, run_preprocess, transcriber, prompt
                )
                # Figure extraction (Stage 1b, 4.2) runs on born-digital pages:
                # store their figures and place fig:// tokens before caching the
                # markdown. Scanned-page figures are the vision detector's, in
                # the 4.3 segmentation pass.
                if figure_extractor is not None and page.kind == "born_digital":
                    page_figures = await asyncio.to_thread(
                        figure_extractor.extract, pdf_bytes, page.page_index
                    )
                    markdown = await store_figures_and_annotate(
                        shards=shards,
                        storage=storage,
                        course_id=course_id,
                        page_index=page.page_index,
                        page_markdown=markdown,
                        page_figures=page_figures,
                    )
                # Scanned pages have no object tree; the vision detector proposes
                # figure boxes and each becomes a page_crop of the page raster.
                elif figure_detector is not None and page.kind == "scanned":
                    markdown = await detect_and_store_page_crops(
                        shards=shards,
                        storage=storage,
                        detector=figure_detector,
                        course_id=course_id,
                        page_index=page.page_index,
                        page_image=page.image_png,
                        page_markdown=markdown,
                    )
                await writer.run(
                    _store_cache(content_hash, page.kind, markdown, provenance)
                )

            await asyncio.to_thread(
                storage.put_object,
                Bucket=IMPORTS_BUCKET,
                Key=image_key,
                Body=page.image_png,
            )
            await writer.run(
                _record_page(import_id, page.page_index, page.kind, image_key, content_hash)
            )

        # Segmentation (Stage 2, 4.3) is the final step: the assembled page
        # markdowns become staged items, pending the professor's confirmation.
        if segmenter is not None:
            await segment_and_stage(
                shards=shards, segmenter=segmenter, course_id=course_id, job_id=import_id
            )

        await writer.run(_finalize(import_id, len(pages)))
        return STATUS_READY
    except Exception:
        await writer.run(_set_status(import_id, STATUS_FAILED))
        raise


async def _decode_page(
    page: DecodedPage,
    run_preprocess: Preprocess,
    transcriber: VisionTranscriber,
    prompt: Prompt,
) -> tuple[str, str]:
    """Produce a page's markdown and its decode provenance. Born-digital pages
    carry their pdfium text; scanned pages are preprocessed and read by the
    vision model. A page preprocessing rejects (blank, or a full-page figure)
    decodes to empty text rather than failing the job."""
    if page.kind == "born_digital":
        return page.text_markdown or "", DEFAULT_PDF_DECODER

    try:
        gray, _binarized, _metrics = await asyncio.to_thread(run_preprocess, page.image_png)
    except PageRejected:
        return "", f"{DEFAULT_VISION_MODEL}+{prompt.provenance}"
    transcription = await transcriber.transcribe(
        gray, prompt.text, model_id=DEFAULT_VISION_MODEL
    )
    return transcription.markdown, f"{DEFAULT_VISION_MODEL}+{prompt.provenance}"


# ------------------------------------------------------------ shard callables


def _read_job(import_id: int) -> Callable[[sqlite3.Connection], str | None]:
    def read(conn: sqlite3.Connection) -> str | None:
        row = conn.execute(
            "SELECT storage_key FROM import_jobs WHERE id = ?", (import_id,)
        ).fetchone()
        return None if row is None else str(row[0])

    return read


def _set_status(import_id: int, status: str) -> Callable[[sqlite3.Connection], None]:
    def apply(conn: sqlite3.Connection) -> None:
        conn.execute(
            "UPDATE import_jobs SET status = ? WHERE id = ?", (status, import_id)
        )

    return apply


def _read_cache(content_hash: str) -> Callable[[sqlite3.Connection], str | None]:
    def read(conn: sqlite3.Connection) -> str | None:
        row = conn.execute(
            "SELECT markdown_z FROM page_documents WHERE content_hash = ?",
            (content_hash,),
        ).fetchone()
        if row is None:
            return None
        from app.compression import decompress_text

        return decompress_text(conn, "problem_text", bytes(row[0]))

    return read


def _store_cache(
    content_hash: str, kind: str, markdown: str, provenance: str
) -> Callable[[sqlite3.Connection], None]:
    now = int(time.time())

    def apply(conn: sqlite3.Connection) -> None:
        conn.execute(
            "INSERT OR IGNORE INTO page_documents"
            " (content_hash, kind, markdown_z, decoder, created_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (
                content_hash,
                kind,
                compress_text(conn, "problem_text", markdown),
                provenance,
                now,
            ),
        )

    return apply


def _record_page(
    import_id: int, page_index: int, kind: str, image_key: str, content_hash: str
) -> Callable[[sqlite3.Connection], None]:
    def apply(conn: sqlite3.Connection) -> None:
        conn.execute(
            "INSERT OR REPLACE INTO import_pages"
            " (job_id, page_index, kind, image_key, content_hash)"
            " VALUES (?, ?, ?, ?, ?)",
            (import_id, page_index, kind, image_key, content_hash),
        )

    return apply


def _finalize(import_id: int, page_count: int) -> Callable[[sqlite3.Connection], None]:
    def apply(conn: sqlite3.Connection) -> None:
        conn.execute(
            "UPDATE import_jobs SET status = ?, page_count = ? WHERE id = ?",
            (STATUS_READY, page_count, import_id),
        )

    return apply
