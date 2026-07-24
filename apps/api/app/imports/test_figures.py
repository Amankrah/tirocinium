"""Milestone 4.2 figure tests. store_figures_and_annotate stores figures
content-addressed, rows them deduped, and places fig:// tokens; the pure
placement helper positions tokens proportionally; and the real
PdfiumFigureExtractor (skip-gated on the pdfium binary) exercises the
deterministic detector through the seam."""

import hashlib
import json
import sqlite3
from pathlib import Path
from typing import Any

import pytest

from app.db.shards import ShardManager
from app.imports.decoder import (
    ExtractedFigure,
    PageFigures,
    PdfiumFigureExtractor,
    pdfium_lib_path,
)
from app.imports.figures import _place_tokens, store_figures_and_annotate
from app.storage import IMPORTS_BUCKET


class FakeStorage:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}

    def create_bucket(self, *, Bucket: str) -> object:
        return {}

    def put_object(self, *, Bucket: str, Key: str, Body: Any) -> object:
        self.objects[(Bucket, Key)] = Body.read() if hasattr(Body, "read") else bytes(Body)
        return {}

    def get_object(self, *, Bucket: str, Key: str) -> Any:
        import io

        return {"Body": io.BytesIO(self.objects[(Bucket, Key)])}

    def generate_presigned_url(
        self, ClientMethod: str, Params: dict[str, str], ExpiresIn: int
    ) -> str:
        return "https://storage.test/unused"


def _figure(
    image: bytes,
    *,
    source: str = "embedded_raster",
    fmt: str = "jpeg",
    bbox: tuple[float, float, float, float] = (50.0, 100.0, 120.0, 90.0),
    caption: str | None = "Figure 1",
    image_2x: bytes | None = None,
) -> ExtractedFigure:
    return ExtractedFigure(
        source=source,  # type: ignore[arg-type]
        bbox=bbox,
        width_px=120,
        height_px=90,
        format=fmt,  # type: ignore[arg-type]
        image=image,
        image_2x=image_2x,
        caption=caption,
    )


def test_place_tokens_positions_by_vertical_fraction() -> None:
    markdown = "L0\nL1\nL2\nL3"
    # y=0 lands the token at the top; y near the page bottom lands it at the end.
    top = _place_tokens(markdown, [(0.0, "TOP")], 800.0)
    bottom = _place_tokens(markdown, [(800.0, "BOTTOM")], 800.0)
    assert top.splitlines()[0] == "TOP"
    assert bottom.splitlines()[-1] == "BOTTOM"


def test_place_tokens_on_an_empty_page_stands_alone() -> None:
    assert _place_tokens("", [(10.0, "A"), (5.0, "B")], 800.0) == "B\n\nA"


async def test_store_figures_places_token_and_rows(tmp_path: Path) -> None:
    storage = FakeStorage()
    async with ShardManager(tmp_path) as shards:
        page_figures = PageFigures(
            page_width=595.0, page_height=842.0, figures=[_figure(b"JPEG-BYTES")]
        )
        markdown = await store_figures_and_annotate(
            shards=shards,
            storage=storage,
            course_id=1,
            page_index=0,
            page_markdown="Line A\nLine B\nLine C",
            page_figures=page_figures,
        )

        digest = hashlib.sha256(b"JPEG-BYTES").hexdigest()

        def read(conn: sqlite3.Connection) -> list[Any]:
            return conn.execute(
                "SELECT content_hash, source, width_px, caption, bbox, page FROM figures"
            ).fetchall()

        rows = await shards.course_reads(1).run(read)

    assert "![Figure 1](fig://" in markdown
    assert (IMPORTS_BUCKET, f"imports/1/figures/{digest}.jpeg") in storage.objects
    assert len(rows) == 1
    assert rows[0][0] == digest
    assert rows[0][1] == "embedded_raster"
    assert rows[0][3] == "Figure 1"
    assert json.loads(rows[0][4]) == [50.0, 100.0, 120.0, 90.0]
    assert rows[0][5] == 0


async def test_store_figures_dedups_identical_bytes(tmp_path: Path) -> None:
    storage = FakeStorage()
    async with ShardManager(tmp_path) as shards:
        same = PageFigures(
            page_width=595.0, page_height=842.0, figures=[_figure(b"SAME")]
        )
        await store_figures_and_annotate(
            shards=shards, storage=storage, course_id=1, page_index=0,
            page_markdown="a", page_figures=same,
        )
        # A second page with the byte-identical figure: one row, one object.
        await store_figures_and_annotate(
            shards=shards, storage=storage, course_id=1, page_index=1,
            page_markdown="b", page_figures=same,
        )

        count = await shards.course_reads(1).run(
            lambda conn: int(conn.execute("SELECT COUNT(*) FROM figures").fetchone()[0])
        )

    assert count == 1


async def test_vector_figure_stores_the_2x_rendition(tmp_path: Path) -> None:
    storage = FakeStorage()
    async with ShardManager(tmp_path) as shards:
        page_figures = PageFigures(
            page_width=595.0,
            page_height=842.0,
            figures=[
                _figure(b"PNG1x", source="vector_render", fmt="png", image_2x=b"PNG2x")
            ],
        )
        await store_figures_and_annotate(
            shards=shards, storage=storage, course_id=1, page_index=2,
            page_markdown="x", page_figures=page_figures,
        )
        key_2x = await shards.course_reads(1).run(
            lambda conn: conn.execute("SELECT storage_key_2x FROM figures").fetchone()[0]
        )

    assert key_2x is not None
    assert (IMPORTS_BUCKET, str(key_2x)) in storage.objects
    assert storage.objects[(IMPORTS_BUCKET, str(key_2x))] == b"PNG2x"


FIXTURES = (
    Path(__file__).resolve().parents[4]
    / "crates" / "platform_core" / "pdf" / "tests" / "fixtures"
)


@pytest.mark.skipif(
    not Path(pdfium_lib_path()).exists(),
    reason="pdfium binary not provisioned (run infra/setup.sh, or set TIRO_PDFIUM_LIB)",
)
def test_pdfium_figure_extractor_reads_a_captioned_figure() -> None:
    pdf_bytes = (FIXTURES / "captioned_figure.pdf").read_bytes()
    source_jpg = (FIXTURES / "source.jpg").read_bytes()

    page = PdfiumFigureExtractor().extract(pdf_bytes, 0)

    assert page.page_width > 0 and page.page_height > 0
    assert len(page.figures) == 1
    figure = page.figures[0]
    assert figure.source == "embedded_raster"
    assert figure.format == "jpeg"
    assert figure.image == source_jpg  # byte-identical through the seam
    assert figure.caption == "Figure 1: the RC circuit."
