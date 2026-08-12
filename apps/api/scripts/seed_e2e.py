"""Seed the state the Playwright journeys cannot create for themselves
(milestone 3.5 part B, decision 0064).

Run it against an empty data directory, and it writes one professor, one
course, one active seat, and the course content the seeded journeys open:

    .venv/bin/python scripts/seed_e2e.py --reset

It emits exactly one line of JSON on stdout, which the CI job parses into the
`E2E_*` environment values the journeys read. Nothing else goes to stdout, so
the line can be consumed without scraping logs.

What is seeded, and what deliberately is not. Journey one authors and publishes
a case study through the UI, because exercising that is the point of running the
professor half in a browser, so no case study of its own is seeded. Everything
else here is state a seat or a professor could not mint from the browser at all:
a seat code is an object-storage artifact of the generation route, a variant is
the output of a worker's generation-and-verification loop, an import is the
output of a decode worker over a real PDF, and a processed submission needs a
vision model. Seeding those is not a shortcut past a UI, it is standing in for
pipelines that a browser test has no business running.

The seat code is the one credential this program prints, once, exactly as the
product rule says: plaintext in exactly one place ever. The professor password
is a fixed non-secret test fixture, and is documented as one.
"""

import argparse
import contextlib
import hashlib
import json
import os
import shutil
import sqlite3
import struct
import sys
import zlib
from pathlib import Path
from typing import Any

# Run as a script (python scripts/seed_e2e.py), only scripts/ is on sys.path;
# the same one-liner export_openapi.py carries.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pydantic import BaseModel

from app.auth.passwords import hash_password
from app.compression import compress_text
from app.db.connection import connect
from app.db.migrations import apply_migrations
from app.db.shards import COURSE_MIGRATIONS, DIRECTORY_MIGRATIONS
from app.e2e import DEFENCE_SUBDIR, TRANSCRIPTION_SUBDIR
from app.seats.codes import code_prefix, generate_code, hash_code, normalize_code
from app.storage import IMPORTS_BUCKET, SCANS_BUCKET, ObjectStorage

# The account the professor journeys sign in as. A fixed, non-secret fixture:
# it exists only in a throwaway data directory that the CI job creates and
# discards, and it is printed by design so the journeys can type it.
#
# The domain is example.com, IANA's reserved documentation domain, and not the
# `.test` TLD that reads like the obvious choice: pydantic's EmailStr refuses
# special-use TLDs, so a seeded professor at a `.test` address is written
# happily into the shard and then cannot sign in, with the login returning 422
# rather than anything a browser test would explain. test_seed_e2e.py validates
# this constant through EmailStr for exactly that reason.
PRO_EMAIL = "professor@e2e.example.com"
PRO_PASSWORD = "journey-one-professor"
COURSE_TITLE = "Fluid Mechanics E2E"

COURSE_ID = 1
SEAT_ID = 1
PRACTICE_CASE_ID = 1
FLAGGED_CASE_ID = 2
PRACTICE_VARIANT_ID = 1
SUBMISSION_ID = 1
IMPORT_ID = 1

# How many staged problems the seeded import carries. See _seed_import: the
# confirmation journey retires two of them per run, and it runs once per
# viewport with Playwright's retries on top, so the count is sized for the
# worst case (every attempt of every project) with room to spare. They are rows
# sharing two figures, so the cost of the headroom is nothing.
IMPORT_ITEM_COUNT = 24

# One fixed instant, so a reseed produces the same timestamps and nothing in a
# journey can depend on wall-clock drift between two runs.
SEEDED_AT = 1_770_000_000

# The journeys' page fixture, reproduced from apps/web/e2e/fixtures.ts. The two
# sides share the pixel specification, not a committed binary: RecordedTranscriber
# keys on the grayscale rendition the Rust preprocess produces, and that is a
# function of the decoded pixels, not of the PNG encoding, so a checkerboard
# built here and a checkerboard built by the browser's own encoder reach the
# same key. A hard checkerboard is maximal high-frequency energy, which is what
# makes it read as sharp to both the client blur pre-check and the server.
UPLOAD_FIXTURE_SIZE = 96


class SeedOutput(BaseModel, frozen=True):
    """The one JSON line, and therefore the contract with the CI job and the
    frontend's journeys. Every field maps to an `E2E_*` variable of the same
    name upper-cased."""

    pro_email: str
    pro_password: str
    course_title: str
    course_id: int
    seat_code: str
    case_study_id: int
    variant_id: int
    flagged_case_study_id: int
    import_id: int
    defence_submission_id: int


# ------------------------------------------------------------------- images


def _png_chunk(kind: bytes, data: bytes) -> bytes:
    body = kind + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))


def grayscale_png(width: int, height: int, rows: list[bytes]) -> bytes:
    """An 8-bit grayscale PNG, written by hand so the seeder needs no imaging
    dependency and so the checkerboard's pixel specification is visible in the
    source rather than buried in a library call."""
    ihdr = struct.pack(">II", width, height) + bytes([8, 0, 0, 0, 0])
    raw = b"".join(b"\x00" + row for row in rows)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", ihdr)
        + _png_chunk(b"IDAT", zlib.compress(raw, 9))
        + _png_chunk(b"IEND", b"")
    )


def upload_fixture_png() -> bytes:
    """The checkerboard of apps/web/e2e/fixtures.ts sharpPagePng()."""
    size = UPLOAD_FIXTURE_SIZE
    rows = [
        bytes(0 if (x + y) % 2 == 0 else 255 for x in range(size)) for y in range(size)
    ]
    return grayscale_png(size, size, rows)


def page_png(width: int, height: int, seed: int) -> bytes:
    """A page-shaped image with ink on it: pale ground, a rule border, and a
    few dark bands whose placement varies with the seed, so two seeded pages
    are visibly different in a screenshot and neither is a blank field that
    preprocessing would reject."""
    rows: list[bytes] = []
    for y in range(height):
        row = bytearray(b"\xf2" * width)
        if y < 3 or y >= height - 3:
            row[:] = b"\x20" * width
        else:
            row[0:3] = b"\x20\x20\x20"
            row[width - 3 : width] = b"\x20\x20\x20"
            band = (y // 24 + seed) % 5
            if band == 0 and 40 < y < height - 40:
                left = 40 + (seed * 17) % 60
                row[left : width - 60] = b"\x28" * (width - 60 - left)
        rows.append(bytes(row))
    return grayscale_png(width, height, rows)


def figure_png(width: int, height: int, seed: int) -> bytes:
    """A small diagram-shaped crop: a framed box with a diagonal, distinct per
    seed. It stands in for a figure extracted from a PDF, and like a real one it
    is only ever copied, never regenerated, once the seeder has written it."""
    rows: list[bytes] = []
    for y in range(height):
        row = bytearray(b"\xff" * width)
        if y < 2 or y >= height - 2:
            row[:] = b"\x00" * width
        else:
            row[0:2] = b"\x00\x00"
            row[width - 2 : width] = b"\x00\x00"
            x = int((y / max(height - 1, 1)) * (width - 1))
            if seed % 2 == 1:
                x = width - 1 - x
            for dx in range(-1, 2):
                if 0 <= x + dx < width:
                    row[x + dx] = 0x30
        rows.append(bytes(row))
    return grayscale_png(width, height, rows)


# ------------------------------------------------------------------ content

PRACTICE_BODY = (
    "# Pump sizing on the delivery line\n\n"
    "A centrifugal pump lifts water through a vertical rise of $12\\,\\text{m}$"
    " at a volumetric flow of $0.045\\,\\mathrm{m^3/s}$. The delivery line adds"
    " a friction head of $3.4\\,\\text{m}$ at that flow.\n\n"
    "Find the hydraulic power the pump must deliver, and state the shaft power"
    " required if the pump runs at an efficiency of $0.72$. Show the head"
    " build-up before you reach for the power.\n"
)

PRACTICE_SOLUTION = (
    "The total head is the static rise plus the friction head,"
    " $H = 12 + 3.4 = 15.4\\,\\text{m}$.\n\n"
    "Hydraulic power follows as $P = \\rho g Q H = 1000 \\times 9.81 \\times"
    " 0.045 \\times 15.4 = 6799\\,\\text{W}$.\n\n"
    "Shaft power is the hydraulic power over the efficiency,"
    " $6799 / 0.72 = 9443\\,\\text{W}$.\n"
)

FLAGGED_BODY = (
    "# Heat exchanger duty\n\n"
    "A counter-flow exchanger cools an oil stream from"
    " $95\\,^{\\circ}\\text{C}$ to $60\\,^{\\circ}\\text{C}$ against water"
    " entering at $20\\,^{\\circ}\\text{C}$. The oil flows at"
    " $2.1\\,\\text{kg/s}$ with a specific heat of"
    " $2.0\\,\\mathrm{kJ/kg\\,K}$.\n\n"
    "Find the duty, and the water outlet temperature for a water flow of"
    " $1.4\\,\\text{kg/s}$.\n"
)

# The reading the seeded submission carries. It is the student's own
# handwriting as the model read it, never a solution, which is why the review
# surface may show it at all.
SUBMISSION_READING = (
    "Total head = 12 + 3.4 = 15.4 m\n\n"
    "P = rho g Q H = 1000 x 9.81 x 0.045 x 15.4\n\n"
    "P = 6799 W\n\n"
    "Shaft power = 6799 / 0.72 = 9443 W\n"
)

# The reply script the defence journey drives. Two questions, because the
# journey sends one typed turn in each of its two tests, and a spare for a
# rerun in the same process. Every reply is a question about the student's own
# working: the tutor never reveals, and a script that did would be a hard-rule
# breach sitting in the repository as an example.
DEFENCE_REPLIES = [
    "You wrote the total head as twelve plus three point four. Tell me what each"
    " of those two numbers is, physically.",
    "Good. Now the efficiency: you divided by nought point seven two rather than"
    " multiplying. What does that choice say about where the losses sit?",
    "Say a little more about how you would check that answer for size.",
    "What would change in your working if the friction head doubled?",
]

# One well-formed closing verdict per conversation the journey opens. The shape
# is the mastery specification's; concept ids are the seeded ones.
DEFENCE_RUBRICS = [
    json.dumps(
        {
            "concepts": [
                {
                    "concept_id": 1,
                    "reasoning": 2,
                    "misconception": "Reads friction head as a loss to subtract",
                }
            ],
            "confidence": 0.7,
            "concept_to_revisit": 1,
        }
    )
] * 4


# ------------------------------------------------------------------ seeding


def _reset(data_dir: Path) -> None:
    for name in ("directory.db", "directory.db-wal", "directory.db-shm"):
        (data_dir / name).unlink(missing_ok=True)
    shutil.rmtree(data_dir / "courses", ignore_errors=True)
    shutil.rmtree(data_dir / "e2e-recorded", ignore_errors=True)


def _seed_directory(data_dir: Path, normalized_code: str) -> None:
    conn = connect(data_dir / "directory.db")
    try:
        apply_migrations(conn, DIRECTORY_MIGRATIONS)
        existing = conn.execute(
            "SELECT 1 FROM users WHERE email = ?", (PRO_EMAIL,)
        ).fetchone()
        if existing is not None:
            raise SystemExit(
                f"{PRO_EMAIL} already exists in {data_dir}. Pass --reset to drop the"
                " directory and course shards and seed again, or point TIRO_DATA_DIR"
                " at an empty directory."
            )
        conn.execute(
            "INSERT INTO users (id, email, password_hash, role, created_at)"
            " VALUES (1, ?, ?, 'professor', ?)",
            (PRO_EMAIL, hash_password(PRO_PASSWORD), SEEDED_AT),
        )
        conn.execute(
            "INSERT INTO courses (id, title, created_at, owner_id) VALUES (?, ?, ?, 1)",
            (COURSE_ID, COURSE_TITLE, SEEDED_AT),
        )
        conn.execute(
            "INSERT INTO seats (id, course_id, seat_number, code_hash, code_prefix,"
            " status, created_at) VALUES (?, ?, 'S-001', ?, ?, 'active', ?)",
            (
                SEAT_ID,
                COURSE_ID,
                hash_code(normalized_code),
                code_prefix(normalized_code),
                SEEDED_AT,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def _seed_case_studies(conn: sqlite3.Connection) -> None:
    for case_id, title, body in (
        (PRACTICE_CASE_ID, "Pump sizing on the delivery line", PRACTICE_BODY),
        (FLAGGED_CASE_ID, "Heat exchanger duty", FLAGGED_BODY),
    ):
        conn.execute(
            "INSERT INTO case_studies (id, author_id, title, body_z, status,"
            " created_at, updated_at) VALUES (?, 1, ?, ?, 'published', ?, ?)",
            (case_id, title, compress_text(conn, "problem_text", body), SEEDED_AT, SEEDED_AT),
        )
    # Concepts and their mappings, so the professor's grade in journey five
    # emits real evidence and the seat's mastery picture has something to show.
    for concept_id, name, description in (
        (1, "Head build-up", "Assembling static and friction head into a total"),
        (2, "Pump efficiency", "Relating hydraulic power to shaft power"),
    ):
        conn.execute(
            "INSERT INTO concepts (id, name, description, position) VALUES (?, ?, ?, ?)",
            (concept_id, name, description, concept_id),
        )
        conn.execute(
            "INSERT INTO case_study_concepts (case_study_id, concept_id, weight)"
            " VALUES (?, ?, 1.0)",
            (PRACTICE_CASE_ID, concept_id),
        )


def _seed_variants(conn: sqlite3.Connection) -> None:
    # The servable one: verified, so the practice read may hand it to a seat.
    conn.execute(
        "INSERT INTO variants (id, case_study_id, seed_json_z, body_z, solution_z,"
        " verification, model_id, created_at, seed, generation_prompt_version,"
        " verification_prompt_version, verify_model_id)"
        " VALUES (?, ?, ?, ?, ?, 'verified', 'seed-e2e', ?, 1, 'v1', 'v1', 'seed-e2e')",
        (
            PRACTICE_VARIANT_ID,
            PRACTICE_CASE_ID,
            compress_text(conn, "problem_text", json.dumps({"rise_m": 12, "flow": 0.045})),
            compress_text(conn, "problem_text", PRACTICE_BODY),
            compress_text(
                conn,
                "problem_text",
                json.dumps({"solution_md": PRACTICE_SOLUTION, "final_answers": ["9443 W"]}),
            ),
            SEEDED_AT,
        ),
    )
    # A queue of flagged ones rather than the two that would just satisfy the
    # assertion. Journey six is destructive (it promotes a variant, which leaves
    # the flagged list) and it runs once per viewport with retries on top, so a
    # seed sized to a single pass leaves the second run staring at an empty
    # queue and failing for a reason that is nothing to do with triage. The same
    # applies to the import items below. A real course has a queue, not a pair.
    for variant_id, seed, wrong in (
        (2, 2, "73.5 kW"),
        (3, 3, "0.42 kW"),
        (4, 4, "1470 kW"),
        (5, 5, "14.7 kW"),
        (6, 6, "205 kW"),
        (7, 7, "98.1 kW"),
        (8, 8, "0.147 kW"),
        (9, 9, "1.47 kW"),
    ):
        conn.execute(
            "INSERT INTO variants (id, case_study_id, seed_json_z, body_z, solution_z,"
            " verification, model_id, created_at, seed, generation_prompt_version,"
            " verification_prompt_version, verify_model_id, verify_solution_z,"
            " flag_reason)"
            " VALUES (?, ?, ?, ?, ?, 'flagged', 'seed-e2e', ?, ?, 'v1', 'v1',"
            " 'seed-e2e', ?, ?)",
            (
                variant_id,
                FLAGGED_CASE_ID,
                compress_text(conn, "problem_text", json.dumps({"seed": seed})),
                compress_text(conn, "problem_text", FLAGGED_BODY),
                compress_text(
                    conn,
                    "problem_text",
                    json.dumps(
                        {
                            "solution_md": (
                                "Duty $Q = \\dot m c_p \\Delta T = 2.1 \\times 2.0"
                                " \\times 35 = 147\\,\\text{kW}$.\n\nWater outlet"
                                " $= 20 + 147 / (1.4 \\times 4.18) ="
                                " 45.1\\,^{\\circ}\\text{C}$.\n"
                            ),
                            "final_answers": ["147 kW", "45.1 C"],
                        }
                    ),
                ),
                SEEDED_AT,
                seed,
                compress_text(
                    conn,
                    "problem_text",
                    f"An independent re-solve reached a duty of {wrong}, which does"
                    " not agree with the generated solution's 147 kW.",
                ),
                f"final answer disagreement: generated 147 kW, re-solve {wrong}",
            ),
        )


def _seed_submission(conn: sqlite3.Connection, storage: ObjectStorage) -> None:
    """One processed submission for the seat, with its two renditions in
    storage and its reading joined by the same content hash the worker would
    have computed. The renditions come from the real preprocess crate, not from
    a second image written by hand, so the professor's review surface is
    looking at exactly what the pipeline would have put there."""
    from platform_core import preprocess as pp

    original = page_png(620, 877, seed=0)
    grayscale, binarized, metrics_json = pp.preprocess(original)
    content_sha = hashlib.sha256(original).hexdigest()

    prefix = f"submissions/{COURSE_ID}/{SUBMISSION_ID}"
    storage.put_object(Bucket=SCANS_BUCKET, Key=f"{prefix}/0.png", Body=original)
    storage.put_object(
        Bucket=SCANS_BUCKET, Key=f"{prefix}/pre/0.grayscale.png", Body=grayscale
    )
    storage.put_object(
        Bucket=SCANS_BUCKET, Key=f"{prefix}/pre/0.binarized.png", Body=binarized
    )

    conn.execute(
        "INSERT INTO submissions (id, variant_id, seat_id, page_count, storage_prefix,"
        " recognized_z, recognition_conf, status, submitted_at)"
        " VALUES (?, ?, ?, 1, ?, ?, 0.82, 'processed', ?)",
        (
            SUBMISSION_ID,
            PRACTICE_VARIANT_ID,
            SEAT_ID,
            prefix,
            compress_text(conn, "handwriting", SUBMISSION_READING),
            SEEDED_AT,
        ),
    )
    conn.execute(
        "INSERT INTO submission_pages (submission_id, page_index, storage_key,"
        " content_type, size_bytes, content_hash, grayscale_key, binarized_key,"
        " metrics_json, quality_status, content_sha)"
        " VALUES (?, 0, ?, 'image/png', ?, ?, ?, ?, ?, 'ok', ?)",
        (
            SUBMISSION_ID,
            f"{prefix}/0.png",
            len(original),
            content_sha,
            f"{prefix}/pre/0.grayscale.png",
            f"{prefix}/pre/0.binarized.png",
            metrics_json,
            content_sha,
        ),
    )
    # Regions follow the handwriting-transcription prompt's convention,
    # [x0, y0, x1, y1] normalised to the rendition, with one deliberately low
    # confidence so the review surface has something to mark.
    regions = [
        {
            "bbox": [0.08, 0.10, 0.92, 0.22],
            "confidence": 0.93,
            "text": "Total head = 12 + 3.4 = 15.4 m",
        },
        {
            "bbox": [0.08, 0.28, 0.92, 0.46],
            "confidence": 0.88,
            "text": "P = rho g Q H = 1000 x 9.81 x 0.045 x 15.4",
        },
        {
            "bbox": [0.08, 0.52, 0.62, 0.62],
            "confidence": 0.41,
            "text": "P = 6799 W",
        },
        {
            "bbox": [0.08, 0.68, 0.92, 0.80],
            "confidence": 0.86,
            "text": "Shaft power = 6799 / 0.72 = 9443 W",
        },
    ]
    conn.execute(
        "INSERT INTO page_transcriptions (content_hash, markdown_z, confidence,"
        " regions_json, model_id, prompt_version, created_at)"
        " VALUES (?, ?, 0.82, ?, 'seed-e2e', 'v1', ?)",
        (
            content_sha,
            compress_text(conn, "handwriting", SUBMISSION_READING),
            json.dumps(regions),
            SEEDED_AT,
        ),
    )


def _seed_import(conn: sqlite3.Connection, storage: ObjectStorage) -> None:
    """A decode job already at 'ready' with two pending items, each carrying a
    figure by its fig:// token, which is what the confirmation surface renders
    and what journey four merges and confirms."""
    storage.put_object(
        Bucket=IMPORTS_BUCKET,
        Key=f"imports/{COURSE_ID}/{IMPORT_ID}/source.pdf",
        Body=b"%PDF-1.4\n% seeded placeholder; the decode already ran\n",
    )
    conn.execute(
        "INSERT INTO import_jobs (id, course_id, storage_key, status, page_count,"
        " created_at) VALUES (?, ?, ?, 'ready', 2, ?)",
        (IMPORT_ID, COURSE_ID, f"imports/{COURSE_ID}/{IMPORT_ID}/source.pdf", SEEDED_AT),
    )

    figure_ids: list[int] = []
    for page_index in range(2):
        raster = page_png(620, 877, seed=page_index + 1)
        page_hash = hashlib.sha256(raster).hexdigest()
        image_key = f"imports/{COURSE_ID}/{IMPORT_ID}/pages/{page_index}.png"
        storage.put_object(Bucket=IMPORTS_BUCKET, Key=image_key, Body=raster)

        crop = figure_png(220, 160, seed=page_index)
        crop_hash = hashlib.sha256(crop).hexdigest()
        crop_key = f"imports/{COURSE_ID}/figures/{crop_hash}.png"
        storage.put_object(Bucket=IMPORTS_BUCKET, Key=crop_key, Body=crop)

        markdown = (
            f"## Problem {page_index + 1}\n\n"
            "The arrangement below carries the flow described in the text.\n\n"
            f"![Arrangement {page_index + 1}](fig://{page_index + 1})\n"
        )
        conn.execute(
            "INSERT INTO page_documents (content_hash, kind, markdown_z, decoder,"
            " created_at) VALUES (?, 'born_digital', ?, 'seed-e2e', ?)",
            (page_hash, compress_text(conn, "problem_text", markdown), SEEDED_AT),
        )
        conn.execute(
            "INSERT INTO import_pages (job_id, page_index, kind, image_key, content_hash)"
            " VALUES (?, ?, 'born_digital', ?, ?)",
            (IMPORT_ID, page_index, image_key, page_hash),
        )
        cursor = conn.execute(
            "INSERT INTO figures (content_hash, storage_key, source, page, bbox,"
            " width_px, height_px, caption, created_at)"
            " VALUES (?, ?, 'embedded_raster', ?, ?, 220, 160, ?, ?)",
            (
                crop_hash,
                crop_key,
                page_index,
                json.dumps([0.18, 0.30, 0.36, 0.18]),
                f"Arrangement {page_index + 1}",
                SEEDED_AT,
            ),
        )
        figure_ids.append(int(cursor.lastrowid or 0))

    # Ten problems over the two pages, not one per page. Journey four merges a
    # sibling into a survivor and confirms it, so each run of it retires two
    # items for good; both viewports run it and Playwright retries on top, so a
    # seed of exactly two is a queue that is empty by the second run. Ten is a
    # plausible problem set and leaves room for every run in a job.
    for index in range(IMPORT_ITEM_COUNT):
        figure_id = figure_ids[index % len(figure_ids)]
        question = (
            f"## Problem {index + 1}\n\n"
            "Water flows through the arrangement shown. Taking the density as"
            " $1000\\,\\mathrm{kg/m^3}$, find the head loss across the"
            " fitting.\n\n"
            f"![Arrangement {index + 1}](fig://{figure_id})\n"
        )
        cursor = conn.execute(
            "INSERT INTO import_items (job_id, title, question_z, solution_z,"
            " page_span, confidence, notes, model_id, prompt_version, state)"
            " VALUES (?, ?, ?, ?, ?, ?, NULL, 'seed-e2e', 'v1', 'pending')",
            (
                IMPORT_ID,
                f"Problem {index + 1}",
                compress_text(conn, "problem_text", question),
                compress_text(
                    conn,
                    "problem_text",
                    "Apply the energy equation between the two tappings and read"
                    " the loss coefficient from the fitting's data.\n",
                ),
                str(index % 2),
                0.72 + 0.02 * index,
            ),
        )
        conn.execute(
            "INSERT INTO item_figures (item_id, figure_id, role) VALUES (?, ?, 'essential')",
            (int(cursor.lastrowid or 0), figure_id),
        )


def _write_recorded(data_dir: Path) -> Path:
    """Write the recorded model responses the live API and worker replay under
    TIRO_E2E_RECORDED_DIR, and return the directory.

    The transcription entry is keyed exactly as the live seam keys it: the
    sha256 of the grayscale rendition the Rust preprocess produces from the
    journey's own uploaded page. Computing it here rather than committing a
    hash-named asset means a change to the preprocessing crate moves the key
    and the recording together, instead of quietly orphaning a fixture and
    sending the journey to a live provider."""
    from platform_core import preprocess as pp

    root = data_dir / "e2e-recorded"
    transcription_dir = root / TRANSCRIPTION_SUBDIR
    defence_dir = root / DEFENCE_SUBDIR
    transcription_dir.mkdir(parents=True, exist_ok=True)
    defence_dir.mkdir(parents=True, exist_ok=True)

    grayscale, _binarized, _metrics = pp.preprocess(upload_fixture_png())
    key = hashlib.sha256(grayscale).hexdigest()
    reading: dict[str, Any] = {
        "markdown": SUBMISSION_READING,
        "confidence": 0.82,
        "regions": [
            {"bbox": [0.08, 0.10, 0.92, 0.24], "confidence": 0.9, "text": "Total head = 15.4 m"},
            {"bbox": [0.08, 0.30, 0.92, 0.52], "confidence": 0.44, "text": "P = 6799 W"},
        ],
    }
    (transcription_dir / f"{key}.json").write_text(
        json.dumps(reading, indent=2) + "\n", encoding="utf-8"
    )
    (defence_dir / "replies.json").write_text(
        json.dumps(DEFENCE_REPLIES, indent=2) + "\n", encoding="utf-8"
    )
    (defence_dir / "rubrics.json").write_text(
        json.dumps(DEFENCE_RUBRICS, indent=2) + "\n", encoding="utf-8"
    )
    return root


def seed(data_dir: Path, storage: ObjectStorage, *, reset: bool = False) -> SeedOutput:
    """Seed one course's world and return the values the journeys need."""
    data_dir.mkdir(parents=True, exist_ok=True)
    if reset:
        _reset(data_dir)

    # generate_code() hands back the formatted code the student types; the
    # hash and the prefix index are over the normalised form, exactly as the
    # generation route does it.
    code = generate_code()
    _seed_directory(data_dir, normalize_code(code))

    (data_dir / "courses").mkdir(parents=True, exist_ok=True)
    conn = connect(data_dir / "courses" / f"{COURSE_ID}.db")
    try:
        apply_migrations(conn, COURSE_MIGRATIONS)
        _seed_case_studies(conn)
        _seed_variants(conn)
        _seed_submission(conn, storage)
        _seed_import(conn, storage)
        conn.commit()
    finally:
        conn.close()

    _write_recorded(data_dir)

    return SeedOutput(
        pro_email=PRO_EMAIL,
        pro_password=PRO_PASSWORD,
        course_title=COURSE_TITLE,
        course_id=COURSE_ID,
        seat_code=code,
        case_study_id=PRACTICE_CASE_ID,
        variant_id=PRACTICE_VARIANT_ID,
        flagged_case_study_id=FLAGGED_CASE_ID,
        import_id=IMPORT_ID,
        defence_submission_id=SUBMISSION_ID,
    )


def ensure_buckets(storage: ObjectStorage) -> None:
    """Create the two buckets the seeded objects land in. Existing buckets are
    not an error: the seeder is expected to run against a MinIO that a previous
    run, or the compose stack, already provisioned."""
    for bucket in (SCANS_BUCKET, IMPORTS_BUCKET):
        with contextlib.suppress(Exception):
            storage.create_bucket(Bucket=bucket)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=None,
        help="where the shards live; defaults to $TIRO_DATA_DIR, else ./data",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="drop directory.db and the course shards first",
    )
    args = parser.parse_args(argv)

    data_dir = args.data_dir or Path(os.environ.get("TIRO_DATA_DIR", "data"))
    # Imported here rather than at module scope so importing this module for
    # its constants never builds a boto3 client.
    from app.storage import get_object_storage

    storage = get_object_storage()
    ensure_buckets(storage)
    output = seed(data_dir, storage, reset=args.reset)
    # Exactly one line, nothing else: the CI step parses stdout directly.
    print(output.model_dump_json())
    return 0


if __name__ == "__main__":
    sys.exit(main())
