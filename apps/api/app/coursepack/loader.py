"""Loading a course pack into a course shard (decision 0077).

The load is idempotent and keyed on the pack's own item keys, so running it
twice updates in place rather than duplicating, and a professor who has since
edited a question in the UI is the one whose edit the next load overwrites,
which is why the loader reports what it changed rather than doing it quietly.

Each question becomes a published case study plus exactly one variant marked
`manual`. That word is load-bearing. `manual` is the verification state the
platform already uses for a variant the professor stands behind rather than
one a model generated and another model checked (milestone 5.3), and it is
servable, so the practice read hands it to a student with no generation, no
pool fill and no model call anywhere on the path. A pack question is the
professor's own work, so `manual` is not a shortcut around verification: it
is the accurate statement about where the text came from.
"""

import hashlib
import json
import sqlite3
import time
from pathlib import Path

from pydantic import BaseModel

from app.compression import compress_text
from app.coursepack.schema import PACK_SCHEME, CoursePack, figure_keys_in
from app.storage import IMPORTS_BUCKET, ObjectStorage

# Recorded in `variants.model_id` and the two prompt-version columns, because
# those columns are provenance and the honest answer here is that no model and
# no prompt produced this row.
PACK_PROVENANCE = "course-pack"

# The pack's base variant. A pack question is not parameterized, so it has one
# seeded variant and the seed is zero; the unique (case_study_id, seed) index
# is what makes a reload an update.
BASE_SEED = 0


class LoadReport(BaseModel, frozen=True):
    """What one load did, printed by the script so a reload is legible."""

    pack: str
    course_id: int
    concepts: int
    figures: int
    questions_created: int
    questions_updated: int


def _sync_concepts(conn: sqlite3.Connection, pack: CoursePack) -> dict[str, int]:
    """Concepts by name, in the pack's order. Matching on name rather than on a
    key column keeps this compatible with concepts a professor created in the
    UI: a pack whose concept is already there adopts it instead of creating a
    second one the mastery picture would show twice."""
    keys: dict[str, int] = {}
    for position, concept in enumerate(pack.concepts):
        row = conn.execute("SELECT id FROM concepts WHERE name = ?", (concept.name,)).fetchone()
        if row is None:
            cursor = conn.execute(
                "INSERT INTO concepts (name, description, position) VALUES (?, ?, ?)",
                (concept.name, concept.description, position),
            )
            keys[concept.key] = int(cursor.lastrowid or 0)
        else:
            keys[concept.key] = int(row[0])
            conn.execute(
                "UPDATE concepts SET description = ?, position = ? WHERE id = ?",
                (concept.description, position, keys[concept.key]),
            )
    return keys


def _sync_figures(
    conn: sqlite3.Connection,
    storage: ObjectStorage,
    pack: CoursePack,
    pack_root: Path,
    course_id: int,
    now: int,
) -> dict[str, int]:
    """Put each figure's committed bytes into object storage content-addressed
    and upsert its metadata row, returning the pack key to row id map.

    The bytes are written exactly as they were extracted from the professor's
    original and are never re-encoded here, which is the figures-are-pixels
    constraint on this path. The declared hash is verified rather than trusted,
    because a figure that changed under a course is precisely what that
    constraint exists to prevent.
    """
    ids: dict[str, int] = {}
    for figure in pack.figures:
        path = pack_root / figure.file
        image = path.read_bytes()
        content_hash = hashlib.sha256(image).hexdigest()
        if content_hash != figure.sha256:
            raise ValueError(
                f"figure {figure.key}: {path} hashes to {content_hash},"
                f" but the pack declares {figure.sha256}"
            )
        suffix = path.suffix.lstrip(".").lower() or "png"
        storage_key = f"imports/{course_id}/figures/{content_hash}.{suffix}"
        storage.put_object(Bucket=IMPORTS_BUCKET, Key=storage_key, Body=image)
        conn.execute(
            "INSERT INTO figures (content_hash, storage_key, source, page, bbox,"
            " width_px, height_px, caption, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            " ON CONFLICT(content_hash) DO UPDATE SET"
            "   storage_key = excluded.storage_key, caption = excluded.caption",
            (
                content_hash,
                storage_key,
                figure.source.kind,
                figure.source.page,
                json.dumps(list(figure.source.bbox)),
                figure.width_px,
                figure.height_px,
                figure.caption,
                now,
            ),
        )
        row = conn.execute(
            "SELECT id FROM figures WHERE content_hash = ?", (content_hash,)
        ).fetchone()
        ids[figure.key] = int(row[0])
    return ids


def resolve_figure_tokens(markdown: str, figure_ids: dict[str, int]) -> str:
    """Rewrite the pack's own `pack:key` scheme into the `fig://{id}` tokens
    every reading surface already renders. Done here rather than in the asset
    because the id is a shard row that does not exist until load time, which is
    what lets one pack load into any number of courses."""
    out = markdown
    for key in figure_keys_in(markdown):
        out = out.replace(f"]({PACK_SCHEME}{key})", f"](fig://{figure_ids[key]})")
    return out


def _sync_question(
    conn: sqlite3.Connection,
    pack: CoursePack,
    question_index: int,
    concept_ids: dict[str, int],
    figure_ids: dict[str, int],
    author_id: int,
    now: int,
) -> bool:
    """Upsert one question. Returns True when it created the case study."""
    question = pack.questions[question_index]
    body = resolve_figure_tokens(question.body_md, figure_ids)
    solution = resolve_figure_tokens(question.solution_md, figure_ids)
    # The 5.3 blob shape, so the unfold, the tutor and answer_match all read a
    # pack question exactly as they read a generated variant.
    solution_blob = json.dumps({"solution_md": solution, "final_answers": question.final_answers})

    existing = conn.execute(
        "SELECT case_study_id, variant_id FROM course_pack_items"
        " WHERE pack_id = ? AND item_key = ?",
        (pack.id, question.key),
    ).fetchone()
    created = existing is None

    if created:
        cursor = conn.execute(
            "INSERT INTO case_studies (author_id, title, body_z, status,"
            " created_at, updated_at) VALUES (?, ?, ?, 'published', ?, ?)",
            (
                author_id,
                question.title,
                compress_text(conn, "problem_text", body),
                now,
                now,
            ),
        )
        case_study_id = int(cursor.lastrowid or 0)
    else:
        case_study_id = int(existing[0])
        conn.execute(
            "UPDATE case_studies SET title = ?, body_z = ?, status = 'published',"
            " updated_at = ? WHERE id = ?",
            (question.title, compress_text(conn, "problem_text", body), now, case_study_id),
        )

    # Mappings are replaced rather than merged: the pack is the source of truth
    # for what a pack question teaches, and a concept dropped from the pack must
    # stop accruing evidence rather than linger.
    conn.execute("DELETE FROM case_study_concepts WHERE case_study_id = ?", (case_study_id,))
    for tag in question.concepts:
        conn.execute(
            "INSERT INTO case_study_concepts (case_study_id, concept_id, weight) VALUES (?, ?, ?)",
            (case_study_id, concept_ids[tag.key], tag.weight),
        )

    # The figure links (course migration 0023). Without these a pack figure is
    # a 404 to the student whose problem references it and is absent from the
    # tutor's context, because both lookups walk a link table and a pack figure
    # is in neither of the import ones. Replaced rather than merged, for the
    # same reason the concept mappings are.
    conn.execute("DELETE FROM case_study_figures WHERE case_study_id = ?", (case_study_id,))
    for figure_key in question.figures:
        conn.execute(
            "INSERT INTO case_study_figures (case_study_id, figure_id, role)"
            " VALUES (?, ?, 'essential')",
            (case_study_id, figure_ids[figure_key]),
        )

    # The parameter spec, if the pack carries one. Written straight to the
    # column the 5.1 PUT writes, because the pack is the reviewed artifact and
    # the figure-frozen check already ran when the spec was accepted into it.
    if question.param_spec is not None:
        conn.execute(
            "UPDATE case_studies SET param_spec_z = ? WHERE id = ?",
            (
                compress_text(conn, "problem_text", json.dumps(question.param_spec)),
                case_study_id,
            ),
        )

    # The marketplace shortlist (course migration 0021, decision 0081).
    # Replaced rather than merged, like the concept mappings and the figures.
    conn.execute(
        "DELETE FROM case_study_shortlist WHERE case_study_id = ?", (case_study_id,)
    )
    for position, sku in enumerate(question.shortlist):
        conn.execute(
            "INSERT INTO case_study_shortlist (case_study_id, sku, position)"
            " VALUES (?, ?, ?)",
            (case_study_id, sku, position),
        )

    conn.execute(
        "INSERT INTO variants (case_study_id, seed_json_z, body_z, solution_z,"
        " verification, model_id, created_at, seed, generation_prompt_version,"
        " verification_prompt_version, verify_model_id)"
        " VALUES (?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?)"
        " ON CONFLICT(case_study_id, seed) DO UPDATE SET"
        "   body_z = excluded.body_z, solution_z = excluded.solution_z,"
        "   verification = 'manual'",
        (
            case_study_id,
            compress_text(conn, "problem_text", json.dumps({"source": question.source})),
            compress_text(conn, "problem_text", body),
            compress_text(conn, "problem_text", solution_blob),
            PACK_PROVENANCE,
            now,
            BASE_SEED,
            pack.provenance,
            pack.provenance,
            PACK_PROVENANCE,
        ),
    )
    variant_row = conn.execute(
        "SELECT id FROM variants WHERE case_study_id = ? AND seed = ?",
        (case_study_id, BASE_SEED),
    ).fetchone()

    conn.execute(
        "INSERT INTO course_pack_items (pack_id, item_key, case_study_id,"
        " variant_id, pack_version, loaded_at) VALUES (?, ?, ?, ?, ?, ?)"
        " ON CONFLICT(pack_id, item_key) DO UPDATE SET"
        "   case_study_id = excluded.case_study_id,"
        "   variant_id = excluded.variant_id,"
        "   pack_version = excluded.pack_version, loaded_at = excluded.loaded_at",
        (pack.id, question.key, case_study_id, int(variant_row[0]), pack.version, now),
    )
    return created


def load_into_course(
    *,
    pack: CoursePack,
    pack_root: Path,
    conn: sqlite3.Connection,
    storage: ObjectStorage,
    course_id: int,
    author_id: int,
    now: int | None = None,
) -> LoadReport:
    """Load the whole pack into one already-migrated course shard. The caller
    owns the transaction, as every writer on this codebase does."""
    stamp = int(time.time()) if now is None else now
    concept_ids = _sync_concepts(conn, pack)
    figure_ids = _sync_figures(conn, storage, pack, pack_root, course_id, stamp)
    created = updated = 0
    for index in range(len(pack.questions)):
        if _sync_question(conn, pack, index, concept_ids, figure_ids, author_id, stamp):
            created += 1
        else:
            updated += 1
    return LoadReport(
        pack=pack.provenance,
        course_id=course_id,
        concepts=len(concept_ids),
        figures=len(figure_ids),
        questions_created=created,
        questions_updated=updated,
    )
