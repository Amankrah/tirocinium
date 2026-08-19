"""Reading the text out of a model reply, in one place (decision 0069).

A Claude response is a list of content blocks and the first one is not always
the text. A model that thinks puts a thinking block first, so `content[0]` is
the wrong block to read, and a seam that reads it fails as though the model had
answered nothing at all. Thinking is on by default on the current models, so
this stopped being an edge case and became the ordinary shape of a reply.

Every live model seam reads its reply through `text_of`, which returns the
first text block and names the caller in the error when a reply carries none.
The recorded seams the test suite drives do not go through here: they replay a
stored value and never see a content block.
"""


def text_of(message: object, what: str) -> str:
    """The first text block of a model reply. `what` names the seam, so the
    error a textless reply raises says which call it was."""
    for block in getattr(message, "content", None) or []:
        if getattr(block, "type", None) != "text":
            continue
        text = getattr(block, "text", None)
        if text is not None:
            return str(text)
    raise ValueError(f"{what} returned no text block")
