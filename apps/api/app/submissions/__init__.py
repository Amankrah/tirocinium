"""Handwritten solution upload (milestone 3.1, backend guide section 4
Stage 1): presigned direct-to-storage upload with server-enforced limits, a
completed-manifest handshake, and idempotency keys. Preprocessing,
transcription, and indexing (3.2 to 3.4) run off the request path in later
milestones. The upload and read endpoints are a seat surface: a seat carries
its one course, so they need no course in the path and a seat reads only its
own rows. The professor's review of those same submissions (milestone 8.1) is a
separate, course-scoped router in `review.py`."""

from app.submissions.review import router as review_router
from app.submissions.routes import router

__all__ = ["review_router", "router"]
