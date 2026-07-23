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
from typing import Literal, Protocol

from pydantic import BaseModel

# The pdfium build the real decoder will bind, recorded as decode provenance on
# born-digital pages. Deployment configuration once the member lands.
DEFAULT_PDF_DECODER = os.environ.get("TIRO_PDF_DECODER_ID", "pdfium")

PageKind = Literal["born_digital", "scanned"]


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
    """The real decoder: pdfium via the platform_core PDF member. Not yet
    implemented; it lands as a focused follow-up (the Rust member and its
    vendored native library) so the request and worker wiring can be built and
    tested first (decision 0021)."""

    def decode(self, pdf_bytes: bytes) -> list[DecodedPage]:
        raise NotImplementedError(
            "pdfium decode lands with the platform_core PDF member (4.1 follow-up)"
        )


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
