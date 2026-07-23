"""Handwritten solution upload (milestone 3.1, backend guide section 4
Stage 1): presigned direct-to-storage upload with server-enforced limits, a
completed-manifest handshake, and idempotency keys. Preprocessing,
transcription, and indexing (3.2 to 3.4) run off the request path in later
milestones. Submissions are a seat surface: a seat carries its one course, so
the endpoints need no course in the path and a seat reads only its own rows."""

from app.submissions.routes import router

__all__ = ["router"]
