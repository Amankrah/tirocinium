"""Handwriting transcription (backend guide section 4 Stages 2 to 3, milestone
3.3). The worker preprocesses each uploaded page with the Rust crate, reads it
with a vision model behind a recorded-response seam, caches the reading by page
content hash, and stores the aggregate in the course shard. Nothing here runs
on the request path; the API only enqueues the job and streams progress.
"""

from app.transcription.model import (
    ILLEGIBLE_TOKEN,
    AnthropicTranscriber,
    PageTranscription,
    RecordedTranscriber,
    Region,
    VisionTranscriber,
)
from app.transcription.pipeline import run_submission_pipeline

__all__ = [
    "ILLEGIBLE_TOKEN",
    "AnthropicTranscriber",
    "PageTranscription",
    "RecordedTranscriber",
    "Region",
    "VisionTranscriber",
    "run_submission_pipeline",
]
