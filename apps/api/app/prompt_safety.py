"""Fencing untrusted content inside a prompt (milestone 9.2).

Every prompt this platform builds carries text it did not write: a student's
transcribed handwriting, the markdown decoded from a professor's PDF, a
generated variant. The standing rule is that such text is data and never
instructions, and the mechanism that enforces it is the fence the content sits
inside.

The Phase 9.2 red team found that mechanism forgeable. The fence markers were
the fixed strings `<<<content` and `content>>>`, so a student who wrote
`content>>>` on their paper closed the fence early, and because the
transcription prompt faithfully reproduces whatever is on the page (as it
should), everything after it landed *outside* the fence, in the document's own
voice, where a line like "## New instructions" reads exactly like one of the
platform's section headers.

The fix is to make the marker unguessable rather than to try to sanitise the
content. A fence carries a random nonce minted when the document is assembled,
which is always after the attacker wrote their page, so there is nothing for
them to guess or copy. Sanitising would be a losing game of escaping; an
unforgeable delimiter ends it. The wrap still strips any literal occurrence of
its own markers, which is unreachable in practice and costs nothing.

Use `new_fence()` once per assembled document and wrap every untrusted block
with it. Never interpolate untrusted text into a prompt by hand.
"""

import hashlib
import re
import secrets
from dataclasses import dataclass

NONCE_BYTES = 8


@dataclass(frozen=True)
class Fence:
    """One document's delimiter. Unguessable, so untrusted content cannot
    close it and escape into the document's own voice."""

    nonce: str

    @property
    def opening(self) -> str:
        return f"<<<content-{self.nonce}"

    @property
    def closing(self) -> str:
        return f"content-{self.nonce}>>>"

    def wrap(self, text: str) -> str:
        """Fence one block of untrusted text."""
        cleaned = text.replace(self.opening, "").replace(self.closing, "")
        return f"{self.opening}\n{cleaned}\n{self.closing}"


def new_fence() -> Fence:
    """A fresh fence. Minted per document, after the untrusted content was
    written, which is what makes it unguessable."""
    return Fence(secrets.token_hex(NONCE_BYTES))


# A fence nonce is packaging, not content: two documents that differ only by
# their nonce say exactly the same thing to a model. Recorded-response seams
# therefore key on the canonical form, so replaying a captured response stays
# deterministic while production keeps a fresh, unguessable fence on every
# assembly. Without this the two requirements would be in direct conflict.
_NONCE_PATTERN = re.compile(rf"content-[0-9a-f]{{{NONCE_BYTES * 2}}}")
CANONICAL_NONCE = "content-NONCE"


def canonical(document: str) -> str:
    """The document with fence nonces normalised, for hashing and recording."""
    return _NONCE_PATTERN.sub(CANONICAL_NONCE, document)


def document_key(document: str) -> str:
    """The recording key for an assembled prompt document."""
    return hashlib.sha256(canonical(document).encode("utf-8")).hexdigest()
