"""Milestone 4.1 follow-up: the real PdfiumDecoder wiring (decision 0024).
Exercises the seam end to end (platform_core.pdf -> DecodedPage models) against
a committed fixture PDF. pdfium is deterministic CPU work, not a model, so this
is a direct call, not a recorded response. Skipped when the native binary is not
provisioned (a bare checkout without infra/setup.sh), so the gate stays green;
CI and the dev host provision it and run the assertion."""

from pathlib import Path

import pytest

from app.imports.decoder import PdfiumDecoder, pdfium_lib_path

REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURES = REPO_ROOT / "crates" / "platform_core" / "pdf" / "tests" / "fixtures"

pytestmark = pytest.mark.skipif(
    not Path(pdfium_lib_path()).exists(),
    reason="pdfium binary not provisioned (run infra/setup.sh, or set TIRO_PDFIUM_LIB)",
)


def test_pdfium_decoder_reads_a_born_digital_page() -> None:
    pdf_bytes = (FIXTURES / "born_digital.pdf").read_bytes()

    pages = PdfiumDecoder(render_width=1000).decode(pdf_bytes)

    assert len(pages) == 1
    page = pages[0]
    assert page.page_index == 0
    assert page.kind == "born_digital"
    assert "net present value" in (page.text_markdown or "")
    assert page.image_png[:4] == b"\x89PNG"


def test_pdfium_decoder_classifies_a_page_without_text_as_scanned() -> None:
    pdf_bytes = (FIXTURES / "no_text_layer.pdf").read_bytes()

    pages = PdfiumDecoder(render_width=1000).decode(pdf_bytes)

    assert len(pages) == 1
    assert pages[0].kind == "scanned"
    assert pages[0].text_markdown is None
    assert pages[0].image_png[:4] == b"\x89PNG"
