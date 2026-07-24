"""The PDF decode seam (backend guide section 5 Stage 1, milestone 4.1). Bytes
of a PDF in, one `DecodedPage` per page out: its classification (born digital
vs scanned), the extracted text for born-digital pages, and a rendered raster
of every page. The real decoder is pdfium in a `platform_core` member (a
focused follow-up, decision 0021); this seam lets the decode pipeline and its
tests run against a fake in the meantime, the same way the model seams do.

Decode is deterministic CPU work, not a model call, so the real path is Rust,
not a recorded response. Tests drive `FakePdfDecoder` with canned pages; the
scanned pages then flow through the existing preprocess and vision seams.
"""

import os
from pathlib import Path
from typing import Literal, Protocol, cast

from pydantic import BaseModel

# The pdfium build the real decoder binds, recorded as decode provenance on
# born-digital pages. Deployment configuration.
DEFAULT_PDF_DECODER = os.environ.get("TIRO_PDF_DECODER_ID", "pdfium")

# Page render width in pixels (about 200 dpi on A4 width), enough detail for the
# vision seam on scanned pages; height follows the page aspect.
DEFAULT_RENDER_WIDTH = 1654

PageKind = Literal["born_digital", "scanned"]


def pdfium_lib_path() -> str:
    """The vendored pdfium binary. `TIRO_PDFIUM_LIB` is the deployment override;
    infra/setup.sh provisions the binary per platform into the crate's vendor
    directory. Returns the first candidate that exists, or the Windows default
    when none do (so a caller can detect an unprovisioned host by the path not
    existing)."""
    override = os.environ.get("TIRO_PDFIUM_LIB")
    if override:
        return override
    vendor = (
        Path(__file__).resolve().parents[4] / "crates" / "platform_core" / "pdf" / "vendor"
    )
    candidates = (
        vendor / "bin" / "pdfium.dll",
        vendor / "lib" / "libpdfium.so",
        vendor / "lib" / "libpdfium.dylib",
    )
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return str(candidates[0])


class DecodedPage(BaseModel, frozen=True):
    """One decoded PDF page. `text_markdown` is the pdfium-extracted text for a
    born-digital page and None for a scanned page (whose text comes from the
    vision seam after preprocessing). `image_png` is a rendered raster of the
    whole page, used for the scanned transcription and for the confirmation
    surface, and it is the server-hashed cache key for the page."""

    page_index: int
    kind: PageKind
    text_markdown: str | None
    image_png: bytes


class PdfDecoder(Protocol):
    def decode(self, pdf_bytes: bytes) -> list[DecodedPage]: ...


class PdfiumDecoder:
    """The real decoder: pdfium via the platform_core PDF member (decision 0024).
    The native library is loaded at runtime from `lib_path`; decode is
    deterministic CPU work, so this is a direct call, not a recorded response."""

    def __init__(
        self, lib_path: str | None = None, render_width: int = DEFAULT_RENDER_WIDTH
    ) -> None:
        self._lib_path = lib_path or pdfium_lib_path()
        self._render_width = render_width

    def decode(self, pdf_bytes: bytes) -> list[DecodedPage]:
        from platform_core import pdf as _pdf

        pages = _pdf.decode(pdf_bytes, self._lib_path, self._render_width)
        return [
            DecodedPage(
                page_index=index,
                kind=cast(PageKind, kind),
                text_markdown=text,
                image_png=image_png,
            )
            for index, kind, text, image_png in pages
        ]


class FakePdfDecoder:
    """The test decoder: returns canned pages, so the decode pipeline is
    exercised without a real PDF or the native library."""

    def __init__(self, pages: list[DecodedPage]) -> None:
        self._pages = list(pages)
        self.calls = 0

    def decode(self, pdf_bytes: bytes) -> list[DecodedPage]:
        self.calls += 1
        return list(self._pages)


def get_decoder() -> PdfDecoder:
    """The worker's decoder; the API never decodes. Tests inject a fake."""
    return PdfiumDecoder()
