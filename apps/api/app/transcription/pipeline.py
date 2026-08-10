"""The per-submission processing pipeline (backend guide section 4 Stages 2 to
3, milestone 3.3), run off the request path by the worker. For each page: fetch
the scan from object storage, preprocess it with the Rust crate, store the two
renditions, read it with the vision model (cached by the server-computed
content hash so retries and re-uploads are free), and record the result. Then
aggregate the pages into the submission's recognized text. Progress is
published to the submission's channel as it goes.

Mode B (milestone 6.5.1, decision 0026): a page whose declared content type is
application/pdf is an exported handwriting PDF. Before the page loop, it is
rendered to page rasters through the PdfDecoder seam (always the raster, never
a text layer) and its row is rewritten as one image row per rendered page, so
everything downstream, preprocess, the vision read, the content-hash cache
(keyed on the rendered bytes), regions, SSE, indexing, and evidence emission,
sees ordinary pages and the chosen mode is invisible. The page-count and size
limits are re-enforced after render, because a PDF's true page count is
unknown until then.

The pipeline is a plain coroutine with its collaborators injected (storage,
transcriber, event bus, the decoder, and even the preprocess function), so
tests drive it with fakes and recorded responses and never touch a live model
or a real image.
"""

import asyncio
import hashlib
import json
import sqlite3
import time
from collections.abc import Callable

from platform_core.preprocess import PageRejected
from platform_core.preprocess import preprocess as _default_preprocess

from app.compression import compress_text, decompress_text
from app.events import EventBus, channel_for
from app.imports.decoder import PdfDecoder
from app.limits import MAX_PAGE_BYTES, MAX_PAGES
from app.prompts import Prompt, load_prompt
from app.storage import SCANS_BUCKET, ObjectStorage, fetch_bytes
from app.telemetry import native_span, record_recognition_confidence
from app.transcription.model import DEFAULT_VISION_MODEL, PageTranscription, VisionTranscriber

# Status vocabulary the pipeline drives submissions through (submissions.status
# is free-form TEXT; the upload path uses 'pending' and 'uploaded').
STATUS_PROCESSING = "processing"
STATUS_PROCESSED = "processed"
STATUS_NEEDS_RETAKE = "needs_retake"
STATUS_FAILED = "failed"
TERMINAL_STATUSES = frozenset({STATUS_PROCESSED, STATUS_NEEDS_RETAKE, STATUS_FAILED})

Preprocess = Callable[[bytes], tuple[bytes, bytes, str]]


def _unpack_rejection(rejected: PageRejected) -> tuple[str, str]:
    args = rejected.args
    reason = str(args[0]) if len(args) > 0 else "rejected"
    message = str(args[1]) if len(args) > 1 else "is unreadable, please retake it"
    return reason, message


async def run_submission_pipeline(
    *,
    shards: object,
    storage: ObjectStorage,
    transcriber: VisionTranscriber,
    bus: EventBus,
    course_id: int,
    submission_id: int,
    prompt: Prompt | None = None,
    preprocess: Preprocess | None = None,
    decoder: PdfDecoder | None = None,
) -> str:
    """Process one submission end to end. Returns the terminal status."""
    from app.db.shards import ShardManager

    assert isinstance(shards, ShardManager)
    prompt = prompt or load_prompt("handwriting-transcription", "v1")
    run_preprocess: Preprocess = preprocess or _default_preprocess
    channel = channel_for(course_id, submission_id)
    reads = shards.course_reads(course_id)
    writer = shards.course(course_id)

    loaded = await reads.run(_read_input(submission_id))
    if loaded is None:
        return STATUS_FAILED
    prefix, pages = loaded

    await writer.run(_set_status(submission_id, STATUS_PROCESSING))
    await bus.publish(channel, {"type": "status", "status": STATUS_PROCESSING})

    if any(content_type == "application/pdf" for _, _, content_type, _ in pages):
        outcome = await _expand_pdf_pages(
            writer=writer,
            storage=storage,
            decoder=decoder,
            channel=channel,
            bus=bus,
            submission_id=submission_id,
            prefix=prefix,
            pages=pages,
        )
        if outcome is not None:
            await writer.run(_set_status(submission_id, STATUS_FAILED))
            await bus.publish(channel, {"type": "done", "status": STATUS_FAILED})
            return STATUS_FAILED
        reloaded = await reads.run(_read_input(submission_id))
        assert reloaded is not None
        prefix, pages = reloaded

    page_markdowns: list[str] = []
    confidences: list[float] = []
    try:
        for page_index, storage_key, _content_type, _size in pages:
            data = await asyncio.to_thread(fetch_bytes, storage, SCANS_BUCKET, storage_key)
            content_hash = hashlib.sha256(data).hexdigest()

            try:
                # The Python-to-Rust boundary, made visible (milestone 8.5):
                # the span covers the native call and nothing around it.
                with native_span(
                    "preprocess", "preprocess", **{"page.bytes": len(data)}
                ):
                    gray, binarized, metrics_json = await asyncio.to_thread(
                        run_preprocess, data
                    )
            except PageRejected as rejected:
                reason, message = _unpack_rejection(rejected)
                await writer.run(_mark_rejected(submission_id, page_index, reason))
                await writer.run(_set_status(submission_id, STATUS_NEEDS_RETAKE))
                await bus.publish(
                    channel,
                    {
                        "type": "rejected",
                        "page_index": page_index,
                        "reason": reason,
                        "message": message,
                    },
                )
                await bus.publish(channel, {"type": "done", "status": STATUS_NEEDS_RETAKE})
                return STATUS_NEEDS_RETAKE

            gray_key = f"{prefix}/pre/{page_index}.grayscale.png"
            binarized_key = f"{prefix}/pre/{page_index}.binarized.png"
            await asyncio.to_thread(
                storage.put_object, Bucket=SCANS_BUCKET, Key=gray_key, Body=gray
            )
            await asyncio.to_thread(
                storage.put_object, Bucket=SCANS_BUCKET, Key=binarized_key, Body=binarized
            )

            cached = await reads.run(_read_cache(content_hash))
            if cached is not None:
                markdown, confidence = cached
            else:
                transcription = await transcriber.transcribe(
                    gray, prompt.text, model_id=DEFAULT_VISION_MODEL
                )
                markdown, confidence = transcription.markdown, transcription.confidence
                await writer.run(
                    _store_cache(content_hash, transcription, prompt.provenance)
                )

            await writer.run(
                _record_page(
                    submission_id, page_index, gray_key, binarized_key, metrics_json, content_hash
                )
            )
            page_markdowns.append(markdown)
            confidences.append(confidence)
            # Product-health dashboard three: how well the reader is reading
            # real handwriting, recorded as it happens.
            record_recognition_confidence(confidence)
            await bus.publish(
                channel,
                {"type": "page", "page_index": page_index, "confidence": confidence},
            )

        recognized = "\n\n".join(page_markdowns)
        mean_confidence = sum(confidences) / len(confidences) if confidences else 0.0
        await writer.run(_finalize(submission_id, recognized, mean_confidence))
        await bus.publish(channel, {"type": "done", "status": STATUS_PROCESSED})
        return STATUS_PROCESSED
    except Exception:
        await writer.run(_set_status(submission_id, STATUS_FAILED))
        await bus.publish(channel, {"type": "done", "status": STATUS_FAILED})
        raise


# ------------------------------------------------------------ shard callables


def _read_input(
    submission_id: int,
) -> Callable[
    [sqlite3.Connection], tuple[str, list[tuple[int, str, str, int]]] | None
]:
    def read(
        conn: sqlite3.Connection,
    ) -> tuple[str, list[tuple[int, str, str, int]]] | None:
        row = conn.execute(
            "SELECT storage_prefix FROM submissions WHERE id = ?", (submission_id,)
        ).fetchone()
        if row is None:
            return None
        pages = conn.execute(
            "SELECT page_index, storage_key, content_type, size_bytes"
            " FROM submission_pages WHERE submission_id = ? ORDER BY page_index",
            (submission_id,),
        ).fetchall()
        return str(row[0]), [
            (int(p[0]), str(p[1]), str(p[2]), int(p[3])) for p in pages
        ]

    return read


# --------------------------------------------------------- mode B expansion


async def _expand_pdf_pages(
    *,
    writer: object,
    storage: ObjectStorage,
    decoder: PdfDecoder | None,
    channel: str,
    bus: EventBus,
    submission_id: int,
    prefix: str,
    pages: list[tuple[int, str, str, int]],
) -> str | None:
    """Render every application/pdf page to rasters and rewrite the page rows
    in one writer transaction, one image row per rendered page, order
    preserved in place. Returns None on success or a rejection reason; the
    caller fails the submission on a reason. Idempotent by construction: once
    rewritten, no application/pdf row remains, so a retried job skips this
    entirely."""
    from app.db.writer import ShardWriter

    assert isinstance(writer, ShardWriter)
    if decoder is None:
        await bus.publish(
            channel,
            {
                "type": "rejected",
                "reason": "pdf_unsupported",
                "message": "PDF submissions can't be processed right now.",
            },
        )
        return "pdf_unsupported"

    # Expand in declared order: an image page carries through; a PDF page
    # contributes one entry per rendered raster, in reading order.
    expanded: list[tuple[str, str, int]] = []  # (storage_key, content_type, size)
    for page_index, storage_key, content_type, size_bytes in pages:
        if content_type != "application/pdf":
            expanded.append((storage_key, content_type, size_bytes))
            continue
        pdf_bytes = await asyncio.to_thread(
            fetch_bytes, storage, SCANS_BUCKET, storage_key
        )
        rendered = await asyncio.to_thread(decoder.decode, pdf_bytes)
        for page in rendered:
            # A handwriting PDF is pixels: always the rendered raster, never
            # a text layer (decision 0026).
            raster_key = f"{prefix}/render/{page_index}.{page.page_index}.png"
            if len(page.image_png) > MAX_PAGE_BYTES:
                await bus.publish(
                    channel,
                    {
                        "type": "rejected",
                        "reason": "page_too_large",
                        "message": "A rendered page exceeds the 15 MiB page limit.",
                    },
                )
                return "page_too_large"
            await asyncio.to_thread(
                storage.put_object,
                Bucket=SCANS_BUCKET,
                Key=raster_key,
                Body=page.image_png,
            )
            expanded.append((raster_key, "image/png", len(page.image_png)))

    if len(expanded) > MAX_PAGES:
        await bus.publish(
            channel,
            {
                "type": "rejected",
                "reason": "too_many_pages",
                "message": (
                    f"This submission has {len(expanded)} pages after rendering;"
                    f" the limit is {MAX_PAGES}."
                ),
            },
        )
        return "too_many_pages"

    def rewrite(conn: sqlite3.Connection) -> None:
        conn.execute(
            "DELETE FROM submission_pages WHERE submission_id = ?", (submission_id,)
        )
        conn.executemany(
            "INSERT INTO submission_pages"
            " (submission_id, page_index, storage_key, content_type, size_bytes)"
            " VALUES (?, ?, ?, ?, ?)",
            [
                (submission_id, index, key, content_type, size)
                for index, (key, content_type, size) in enumerate(expanded)
            ],
        )
        conn.execute(
            "UPDATE submissions SET page_count = ? WHERE id = ?",
            (len(expanded), submission_id),
        )

    await writer.run(rewrite)
    return None


def _set_status(submission_id: int, status: str) -> Callable[[sqlite3.Connection], None]:
    def apply(conn: sqlite3.Connection) -> None:
        conn.execute(
            "UPDATE submissions SET status = ? WHERE id = ?", (status, submission_id)
        )

    return apply


def _mark_rejected(
    submission_id: int, page_index: int, reason: str
) -> Callable[[sqlite3.Connection], None]:
    def apply(conn: sqlite3.Connection) -> None:
        conn.execute(
            "UPDATE submission_pages SET quality_status = 'rejected', reject_reason = ?"
            " WHERE submission_id = ? AND page_index = ?",
            (reason, submission_id, page_index),
        )

    return apply


def _read_cache(
    content_hash: str,
) -> Callable[[sqlite3.Connection], tuple[str, float] | None]:
    def read(conn: sqlite3.Connection) -> tuple[str, float] | None:
        row = conn.execute(
            "SELECT markdown_z, confidence FROM page_transcriptions WHERE content_hash = ?",
            (content_hash,),
        ).fetchone()
        if row is None:
            return None
        return decompress_text(conn, "handwriting", bytes(row[0])), float(row[1])

    return read


def _store_cache(
    content_hash: str, transcription: PageTranscription, prompt_version: str
) -> Callable[[sqlite3.Connection], None]:
    regions_json = json.dumps([region.model_dump() for region in transcription.regions])
    now = int(time.time())

    def apply(conn: sqlite3.Connection) -> None:
        conn.execute(
            "INSERT OR IGNORE INTO page_transcriptions"
            " (content_hash, markdown_z, confidence, regions_json, model_id,"
            "  prompt_version, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                content_hash,
                compress_text(conn, "handwriting", transcription.markdown),
                transcription.confidence,
                regions_json,
                DEFAULT_VISION_MODEL,
                prompt_version,
                now,
            ),
        )

    return apply


def _record_page(
    submission_id: int,
    page_index: int,
    grayscale_key: str,
    binarized_key: str,
    metrics_json: str,
    content_sha: str,
) -> Callable[[sqlite3.Connection], None]:
    def apply(conn: sqlite3.Connection) -> None:
        conn.execute(
            "UPDATE submission_pages SET grayscale_key = ?, binarized_key = ?,"
            " metrics_json = ?, content_sha = ?, quality_status = 'ok'"
            " WHERE submission_id = ? AND page_index = ?",
            (grayscale_key, binarized_key, metrics_json, content_sha, submission_id, page_index),
        )

    return apply


def _finalize(
    submission_id: int, recognized: str, mean_confidence: float
) -> Callable[[sqlite3.Connection], None]:
    def apply(conn: sqlite3.Connection) -> None:
        conn.execute(
            "UPDATE submissions SET recognized_z = ?, recognition_conf = ?,"
            " status = ? WHERE id = ?",
            (
                compress_text(conn, "handwriting", recognized),
                mean_confidence,
                STATUS_PROCESSED,
                submission_id,
            ),
        )

    return apply
