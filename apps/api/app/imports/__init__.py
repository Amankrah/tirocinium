"""PDF import (Phase 4, backend guide section 5). Milestone 4.1 (decode): a
professor uploads a PDF, and a worker decodes each page to markdown (born
digital via pdfium, scanned via the Phase 3 preprocess and vision path), cached
by content hash. Figure extraction (4.2), segmentation (4.3), and the
confirmation surface (4.4) build on the decoded page documents."""

from app.imports.routes import router

__all__ = ["router"]
