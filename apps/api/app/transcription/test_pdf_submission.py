"""Milestone 6.5.1 (mode B, decision 0026): an exported handwriting PDF in
the submission pipeline. A PDF page renders to rasters through the decoder
seam and its row is rewritten as ordinary image pages, so preprocess, the
vision read, the cache (keyed on the rendered bytes), and evidence emission
see the photographed-page path unchanged. The gate's parity property: the
same handwriting submitted as a photo and as an exported PDF reaches the same
transcription and the same evidence shape. The committed real tablet PDFs
drive the skip-gated render test."""

import hashlib
import json
import sqlite3
from pathlib import Path

import pytest

from app.compression import compress_text
from app.db.shards import ShardManager
from app.imports.decoder import DecodedPage, FakePdfDecoder, PdfiumDecoder, pdfium_lib_path
from app.lfs import SKIP_REASON, any_unfetched
from app.limits import MAX_PAGES
from app.mastery.emission import emit_submission_evidence
from app.mastery.model import (
    RecordedWorkingAssessor,
    WorkingAssessment,
    assessment_document,
)
from app.storage import SCANS_BUCKET
from app.transcription.model import PageTranscription, RecordedTranscriber, Region
from app.transcription.pipeline import (
    STATUS_FAILED,
    STATUS_PROCESSED,
    run_submission_pipeline,
)
from app.transcription.test_pipeline import FakeStorage, RecordingBus, fake_preprocess_ok

FIXTURES = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "submission-pdf"

DAY = 86_400


def rendered(index: int, body: bytes) -> DecodedPage:
    return DecodedPage(
        page_index=index, kind="scanned", text_markdown=None, image_png=body
    )


async def seed_submission(
    shards: ShardManager,
    storage: FakeStorage,
    pages: list[tuple[str, bytes]],
    *,
    course_id: int = 1,
    prefix: str = "scans/1/sub",
    final_answers: list[str] | None = None,
) -> int:
    """A submission whose pages carry declared content types; the case study
    maps one concept so evidence emission has somewhere to land."""

    def create(conn: sqlite3.Connection) -> int:
        conn.execute(
            "INSERT OR IGNORE INTO concepts (id, name, position) VALUES (7, 'Ohm', 1)"
        )
        case = conn.execute(
            "INSERT INTO case_studies (author_id, title, body_z, status, created_at,"
            " updated_at) VALUES (1, 't', ?, 'published', 0, 0)",
            (compress_text(conn, "problem_text", "# t"),),
        )
        conn.execute(
            "INSERT INTO case_study_concepts (case_study_id, concept_id, weight)"
            " VALUES (?, 7, 1.0)",
            (case.lastrowid,),
        )
        solution = json.dumps(
            {
                "solution_md": "I = V/R.",
                "final_answers": final_answers if final_answers is not None else [],
            }
        )
        variant = conn.execute(
            "INSERT INTO variants (case_study_id, seed_json_z, body_z, solution_z,"
            " verification, model_id, created_at)"
            " VALUES (?, ?, ?, ?, 'verified', 'm', 0)",
            (
                case.lastrowid,
                compress_text(conn, "problem_text", "{}"),
                compress_text(conn, "problem_text", "b"),
                compress_text(conn, "problem_text", solution),
            ),
        )
        submission = conn.execute(
            "INSERT INTO submissions (variant_id, seat_id, page_count, storage_prefix,"
            " status, submitted_at) VALUES (?, 1, ?, ?, 'uploaded', 0)",
            (variant.lastrowid, len(pages), prefix),
        )
        submission_id = submission.lastrowid
        assert submission_id is not None
        for index, (content_type, body) in enumerate(pages):
            conn.execute(
                "INSERT INTO submission_pages (submission_id, page_index, storage_key,"
                " content_type, size_bytes) VALUES (?, ?, ?, ?, ?)",
                (submission_id, index, f"{prefix}/{index}", content_type, len(body)),
            )
        return int(submission_id)

    submission_id = await shards.course(course_id).run(create)
    for index, (_content_type, body) in enumerate(pages):
        storage.objects[(SCANS_BUCKET, f"{prefix}/{index}")] = body
    return submission_id


def transcriber_for(page_bodies: list[bytes]) -> RecordedTranscriber:
    return RecordedTranscriber(
        {
            hashlib.sha256(b"gray:" + body).hexdigest(): PageTranscription(
                markdown=f"Reading of {body.decode(errors='replace')[:24]}",
                confidence=0.9,
                regions=[
                    Region(bbox=(0, 0, 1, 1), confidence=0.9, text="I = 2.553 mA")
                ],
            )
            for body in page_bodies
        }
    )


def page_rows(shards_path: Path, course_id: int = 1) -> list[tuple[int, str, int]]:
    from app.db.connection import connect

    conn = connect(shards_path / "courses" / f"{course_id}.db")
    try:
        return [
            (int(r[0]), str(r[1]), int(r[2]))
            for r in conn.execute(
                "SELECT page_index, content_type, size_bytes FROM submission_pages"
                " ORDER BY page_index"
            ).fetchall()
        ]
    finally:
        conn.close()


async def test_a_pdf_submission_renders_expands_and_processes(tmp_path: Path) -> None:
    storage = FakeStorage()
    bus = RecordingBus()
    bodies = [b"pdf-page-0", b"pdf-page-1", b"pdf-page-2"]
    decoder = FakePdfDecoder([rendered(i, body) for i, body in enumerate(bodies)])
    async with ShardManager(tmp_path) as shards:
        submission_id = await seed_submission(
            shards, storage, [("application/pdf", b"%PDF-fake")]
        )
        status = await run_submission_pipeline(
            shards=shards,
            storage=storage,
            transcriber=transcriber_for(bodies),
            bus=bus,
            course_id=1,
            submission_id=submission_id,
            preprocess=fake_preprocess_ok,
            decoder=decoder,
        )

        assert status == STATUS_PROCESSED
        # An N-page PDF yields N rendered pages: the row rewrite in action.
        assert page_rows(tmp_path) == [
            (0, "image/png", len(b"pdf-page-0")),
            (1, "image/png", len(b"pdf-page-1")),
            (2, "image/png", len(b"pdf-page-2")),
        ]

        def read(conn: sqlite3.Connection) -> tuple[int, int]:
            count = conn.execute(
                "SELECT page_count FROM submissions WHERE id = ?", (submission_id,)
            ).fetchone()
            cached = conn.execute(
                "SELECT COUNT(*) FROM page_transcriptions"
            ).fetchone()
            return int(count[0]), int(cached[0])

        page_count, cached = await shards.course_reads(1).run(read)
    assert page_count == 3
    assert cached == 3  # cached transcriptions keyed on the rendered bytes
    assert bus.types().count("page") == 3


async def test_mixed_photo_and_pdf_pages_keep_reading_order(tmp_path: Path) -> None:
    storage = FakeStorage()
    bus = RecordingBus()
    pdf_bodies = [b"pdf-a", b"pdf-b"]
    decoder = FakePdfDecoder([rendered(i, b) for i, b in enumerate(pdf_bodies)])
    async with ShardManager(tmp_path) as shards:
        submission_id = await seed_submission(
            shards,
            storage,
            [
                ("image/jpeg", b"photo-front"),
                ("application/pdf", b"%PDF-fake"),
                ("image/jpeg", b"photo-back"),
            ],
        )
        status = await run_submission_pipeline(
            shards=shards,
            storage=storage,
            transcriber=transcriber_for(
                [b"photo-front", *pdf_bodies, b"photo-back"]
            ),
            bus=bus,
            course_id=1,
            submission_id=submission_id,
            preprocess=fake_preprocess_ok,
            decoder=decoder,
        )

        def recognized(conn: sqlite3.Connection) -> str:
            from app.compression import decompress_text

            row = conn.execute(
                "SELECT recognized_z FROM submissions WHERE id = ?", (submission_id,)
            ).fetchone()
            return decompress_text(conn, "handwriting", bytes(row[0]))

        text = await shards.course_reads(1).run(recognized)
    assert status == STATUS_PROCESSED
    # The PDF expands in place: front photo, both rendered pages, back photo.
    assert text.split("\n\n") == [
        "Reading of photo-front",
        "Reading of pdf-a",
        "Reading of pdf-b",
        "Reading of photo-back",
    ]


async def test_an_over_limit_pdf_is_rejected_with_the_page_count_copy(
    tmp_path: Path,
) -> None:
    storage = FakeStorage()
    bus = RecordingBus()
    decoder = FakePdfDecoder(
        [rendered(i, f"page-{i}".encode()) for i in range(MAX_PAGES + 1)]
    )
    transcriber = transcriber_for([])
    async with ShardManager(tmp_path) as shards:
        submission_id = await seed_submission(
            shards, storage, [("application/pdf", b"%PDF-fake")]
        )
        status = await run_submission_pipeline(
            shards=shards,
            storage=storage,
            transcriber=transcriber,
            bus=bus,
            course_id=1,
            submission_id=submission_id,
            preprocess=fake_preprocess_ok,
            decoder=decoder,
        )
    assert status == STATUS_FAILED
    rejected = [e for _c, e in bus.events if e["type"] == "rejected"]
    assert rejected[0]["reason"] == "too_many_pages"
    assert f"the limit is {MAX_PAGES}" in str(rejected[0]["message"])
    assert f"{MAX_PAGES + 1} pages after rendering" in str(rejected[0]["message"])
    assert transcriber.calls == 0  # rejected before any model call


async def test_a_retry_neither_redecodes_nor_rereads(tmp_path: Path) -> None:
    storage = FakeStorage()
    bus = RecordingBus()
    bodies = [b"pdf-page-0"]
    decoder = FakePdfDecoder([rendered(0, bodies[0])])
    transcriber = transcriber_for(bodies)
    async with ShardManager(tmp_path) as shards:
        submission_id = await seed_submission(
            shards, storage, [("application/pdf", b"%PDF-fake")]
        )
        first = await run_submission_pipeline(
            shards=shards, storage=storage, transcriber=transcriber, bus=bus,
            course_id=1, submission_id=submission_id,
            preprocess=fake_preprocess_ok, decoder=decoder,
        )
        again = await run_submission_pipeline(
            shards=shards, storage=storage, transcriber=transcriber, bus=bus,
            course_id=1, submission_id=submission_id,
            preprocess=fake_preprocess_ok, decoder=decoder,
        )
    assert (first, again) == (STATUS_PROCESSED, STATUS_PROCESSED)
    assert decoder.calls == 1  # the rewrite left no PDF row to expand
    assert transcriber.calls == 1  # the cache keyed on the rendered bytes


async def test_a_pdf_without_a_decoder_fails_honestly(tmp_path: Path) -> None:
    storage = FakeStorage()
    bus = RecordingBus()
    async with ShardManager(tmp_path) as shards:
        submission_id = await seed_submission(
            shards, storage, [("application/pdf", b"%PDF-fake")]
        )
        status = await run_submission_pipeline(
            shards=shards, storage=storage, transcriber=transcriber_for([]),
            bus=bus, course_id=1, submission_id=submission_id,
            preprocess=fake_preprocess_ok, decoder=None,
        )
    assert status == STATUS_FAILED
    rejected = [e for _c, e in bus.events if e["type"] == "rejected"]
    assert rejected[0]["reason"] == "pdf_unsupported"


async def test_parity_photo_and_pdf_reach_the_same_transcription_and_evidence(
    tmp_path: Path,
) -> None:
    """The gate's parity property: the same handwriting as a photo (mode A)
    and as an exported PDF (mode B) reaches the same transcription and the
    same evidence shape; downstream, the mode is invisible."""
    storage = FakeStorage()
    bus = RecordingBus()
    ink = b"the-same-handwriting"
    decoder = FakePdfDecoder([rendered(0, ink)])
    async with ShardManager(tmp_path) as shards:
        photo = await seed_submission(
            shards, storage, [("image/jpeg", ink)],
            prefix="scans/1/photo", final_answers=["2.553 mA"],
        )
        pdf = await seed_submission(
            shards, storage, [("application/pdf", b"%PDF-fake")],
            prefix="scans/1/pdf", final_answers=["2.553 mA"],
        )
        results = {}
        for name, submission_id, use_decoder in (
            ("photo", photo, None),
            ("pdf", pdf, decoder),
        ):
            status = await run_submission_pipeline(
                shards=shards, storage=storage,
                transcriber=transcriber_for([ink]), bus=bus,
                course_id=1, submission_id=submission_id,
                preprocess=fake_preprocess_ok, decoder=use_decoder,
            )
            assert status == STATUS_PROCESSED
            assessor = RecordedWorkingAssessor({})
            assessor.record(
                assessment_document(
                    f"Reading of {ink.decode()}", "I = V/R.", [(7, "Ohm", None)]
                ),
                WorkingAssessment.model_validate(
                    {"concepts": [{"concept_id": 7, "rubric": 3}], "confidence": 0.9}
                ),
            )
            counts = await emit_submission_evidence(
                shards=shards, storage=storage, assessor=assessor,
                course_id=1, submission_id=submission_id, at=DAY,
            )

            def read(
                conn: sqlite3.Connection, sid: int = submission_id
            ) -> tuple[str, list[tuple[str, float, float, float]]]:
                from app.compression import decompress_text

                row = conn.execute(
                    "SELECT recognized_z FROM submissions WHERE id = ?", (sid,)
                ).fetchone()
                events = [
                    (str(e[0]), float(e[1]), float(e[2]), float(e[3]))
                    for e in conn.execute(
                        "SELECT source, score, confidence, k FROM evidence_events"
                        " WHERE ref_id = ? ORDER BY source",
                        (sid,),
                    ).fetchall()
                ]
                return (
                    decompress_text(conn, "handwriting", bytes(row[0])),
                    events,
                )

            results[name] = (counts, *await shards.course_reads(1).run(read))

    photo_counts, photo_text, photo_events = results["photo"]
    pdf_counts, pdf_text, pdf_events = results["pdf"]
    assert photo_text == pdf_text  # the same transcription
    assert photo_counts == pdf_counts
    assert photo_events == pdf_events  # the same evidence shape
    assert photo_events != []


@pytest.mark.skipif(
    not Path(pdfium_lib_path()).exists(),
    reason="pdfium not provisioned (infra/setup.sh)",
)
@pytest.mark.skipif(any_unfetched(FIXTURES / "question-1.pdf"), reason=SKIP_REASON)
async def test_a_committed_tablet_pdf_round_trips_through_the_pipeline(
    tmp_path: Path,
) -> None:
    """The gate's round trip on a captured asset: a real tablet-handwriting
    PDF renders through the real pdfium decoder, expands to its true page
    count, and processes to a cached transcription with a recorded response
    (never a live model)."""
    pdf_bytes = (FIXTURES / "question-1.pdf").read_bytes()
    decoder = PdfiumDecoder()
    rendered_pages = decoder.decode(pdf_bytes)
    assert len(rendered_pages) == 2  # the fixture is a two-page export

    storage = FakeStorage()
    bus = RecordingBus()
    transcriber = transcriber_for([page.image_png for page in rendered_pages])
    async with ShardManager(tmp_path) as shards:
        submission_id = await seed_submission(
            shards, storage, [("application/pdf", pdf_bytes)]
        )
        status = await run_submission_pipeline(
            shards=shards, storage=storage, transcriber=transcriber, bus=bus,
            course_id=1, submission_id=submission_id,
            preprocess=fake_preprocess_ok, decoder=decoder,
        )

        def read(conn: sqlite3.Connection) -> tuple[str, int]:
            row = conn.execute(
                "SELECT status, page_count FROM submissions WHERE id = ?",
                (submission_id,),
            ).fetchone()
            return str(row[0]), int(row[1])

        final_status, page_count = await shards.course_reads(1).run(read)
    assert status == STATUS_PROCESSED
    assert (final_status, page_count) == (STATUS_PROCESSED, 2)
    assert transcriber.calls == 2  # one recorded reading per rendered page
