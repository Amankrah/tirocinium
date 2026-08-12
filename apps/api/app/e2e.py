"""The browser-tier test doubles (milestone 3.5 part B, decision 0064).

The pytest suite injects recorded seams through fixtures, which the browser
tier cannot do: the Playwright journeys drive a real uvicorn process and a real
arq worker, and those two build their seams from module-level factories. So the
seeded journeys need the same substitution one level out, and this module is
it: the single place a live process is allowed to answer with a double, gated
on one explicit environment variable.

The gate is `TIRO_E2E_RECORDED_DIR`. Unset (which is every deployment and every
developer shell), every factory here returns None and the callers build their
live seams exactly as before. Set, it must name a directory the seeder wrote,
and a missing directory is an error rather than a quiet fall back to the live
model, because a journey that silently reached a real provider would be both a
cost and a lie about what was verified.

What is recorded and what is stubbed is a deliberate split. The transcriber and
the tutor are *recorded*: a journey asserts on the reading the student sees and
on the tutor's reply, so those responses are fixed data the seeder writes and
keys exactly as the live seams key them. The embedder and the working assessor
are *stubs*: no journey asserts on an embedding vector or a rubric score, and a
hash-keyed recorded asset for either would couple the seed to the pipeline's
internal document assembly with no assertion standing behind the coupling. A
stub is still not a model call, which is the rule that matters.
"""

import hashlib
import logging
import os
from pathlib import Path

from app.mastery.model import WorkingAssessment
from app.retrieval.model import Embedder
from app.transcription.model import (
    PageTranscription,
    RecordedTranscriber,
    Region,
    VisionTranscriber,
)

RECORDED_DIR_ENV = "TIRO_E2E_RECORDED_DIR"

# The seeder writes these two subdirectories; the names are the contract
# between it and this module.
TRANSCRIPTION_SUBDIR = "transcription"
DEFENCE_SUBDIR = "defense"

_logger = logging.getLogger("tirocinium.e2e")

# The stub embedder's width. The retrieval member quantizes whatever it is
# given, so the only thing that matters is that it is fixed and non-degenerate.
_STUB_EMBEDDING_DIMS = 32


def recorded_dir() -> Path | None:
    """The directory of recorded responses, or None when the platform is
    running normally. Raises when the variable names a directory that is not
    there, so a misconfigured CI job fails at startup rather than at the first
    model call."""
    configured = os.environ.get(RECORDED_DIR_ENV)
    if not configured:
        return None
    directory = Path(configured)
    if not directory.is_dir():
        raise RuntimeError(
            f"{RECORDED_DIR_ENV} is set to {configured!r}, which is not a directory."
            " Run scripts/seed_e2e.py first, or unset the variable to use the"
            " live model seams."
        )
    _logger.warning(
        "Recorded model seams are active (%s=%s). This is the end-to-end"
        " journey configuration and must never be set in a deployment.",
        RECORDED_DIR_ENV,
        configured,
    )
    return directory


class StubEmbedder:
    """A deterministic vector per text, so indexing completes without a
    provider. Not a recorded response and not pretending to be one: the vector
    carries no semantics, and nothing in the journeys reads it back. Retrieval
    itself is a professor surface with its own suite; this only keeps the
    worker's Stage 4 from erroring behind a journey that is about Stage 3."""

    async def embed(self, text: str, *, model_id: str) -> list[float]:
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        return [
            (digest[i % len(digest)] - 127.5) / 127.5 for i in range(_STUB_EMBEDDING_DIMS)
        ]


class StubWorkingAssessor:
    """An assessment that names no concept, which emission treats exactly as it
    treats a model that named only unmapped ones: nothing is emitted. The
    evidence the seeded journeys care about is the professor's grade (journey
    five), which is its own endpoint and emits for real."""

    async def assess(
        self, document: str, images: list[bytes], prompt: str, *, model_id: str
    ) -> WorkingAssessment:
        return WorkingAssessment(concepts=[], confidence=0.0)


class FallbackTranscriber:
    """The recorded reader, with one stated fallback.

    Journey two uploads a page whose pixels the seeder knows, so its rendition
    hashes to a recorded response and the whole chain (preprocess, the server's
    hash, the cache key, the seam) is exercised for real. Mode C cannot work
    that way: it draws on a canvas with a pointer, and what comes out is not
    reproducible from a specification, so no recording can be keyed to it in
    advance.

    Rather than leave that journey skipped, an unrecorded page gets a fixed
    reading and says so in the log. That keeps the exact-key path honest where
    it can be honest (a drifted key still reaches the recorded response or is
    visibly a fallback) while letting the pen-capture journey run end to end,
    which is what it is actually about."""

    def __init__(self, recorded: RecordedTranscriber, fallback: PageTranscription) -> None:
        self._recorded = recorded
        self._fallback = fallback
        self.fallbacks = 0

    async def transcribe(
        self, image_png: bytes, prompt: str, *, model_id: str
    ) -> PageTranscription:
        try:
            return await self._recorded.transcribe(image_png, prompt, model_id=model_id)
        except KeyError:
            self.fallbacks += 1
            _logger.warning(
                "No recorded reading for this page (sha256 %s); using the"
                " end-to-end fallback. Expected for the pen-capture journey,"
                " and a drifted key everywhere else.",
                hashlib.sha256(image_png).hexdigest(),
            )
            return self._fallback


FALLBACK_READING = PageTranscription(
    markdown="Working shown on the page.\n",
    confidence=0.75,
    regions=[Region(bbox=(0.1, 0.1, 0.9, 0.4), confidence=0.75, text="Working shown")],
)


def e2e_transcriber() -> VisionTranscriber | None:
    """The recorded handwriting reader for the seeded upload journeys, or None
    when the recorded mode is off."""
    directory = recorded_dir()
    if directory is None:
        return None
    recorded = RecordedTranscriber.from_dir(directory / TRANSCRIPTION_SUBDIR)
    return FallbackTranscriber(recorded, FALLBACK_READING)


def e2e_embedder() -> Embedder | None:
    directory = recorded_dir()
    if directory is None:
        return None
    return StubEmbedder()


def e2e_assessor() -> StubWorkingAssessor | None:
    directory = recorded_dir()
    if directory is None:
        return None
    return StubWorkingAssessor()


def e2e_tutor_dir() -> Path | None:
    """Where the scripted defence session lives, or None when the recorded mode
    is off. The tutor itself is built per conversation (it is a request
    dependency), so the factory hands back the directory rather than one
    long-lived instance whose reply script would run out on the second
    conversation."""
    directory = recorded_dir()
    if directory is None:
        return None
    return directory / DEFENCE_SUBDIR
