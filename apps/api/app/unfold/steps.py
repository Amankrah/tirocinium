"""Splitting a worked solution into unfoldable steps (milestone 8.4).

The understanding unfold (frontend guide 4.2) reveals the professor's solution
a step at a time rather than as a wall of text. The split is deterministic and
done here in Python, never by a model, for the same reason the import pipeline
forbids improving extracted text: a model asked to "break this into steps"
would paraphrase, renumber, or tidy the professor's words, and the solution a
student reads must be the solution the professor wrote. This is authoring-time
text structure, like the edit distance of decision 0030, not the arithmetic the
guides mandate to Rust.

The split therefore only ever *cuts*; it never rewrites. Every step carries the
span it came from, and the fidelity property the suite pins is that the spans
are ordered, non-overlapping, exactly equal to the step text, and separated
only by whitespace, so no character of the professor's content is lost, moved,
or altered.

Cut points are markdown block boundaries: blank lines at the top level, and
each item of a top-level list, because a numbered list is how a worked solution
usually already spells its steps. Fenced code and display-math blocks are
atomic, since splitting inside one would corrupt the very notation the
solution is made of. A heading alone is not a step; it joins the block it
introduces. A `fig://` token travels inside whichever step holds it, exactly
where the professor placed it.
"""

import re

from pydantic import BaseModel

_FENCE = re.compile(r"^\s{0,3}(`{3,}|~{3,})")
_DISPLAY_MATH = re.compile(r"^\s{0,3}\$\$")
_HEADING = re.compile(r"^\s{0,3}#{1,6}\s")
_LIST_ITEM = re.compile(r"^(\s{0,3})(?:[-*+]|\d{1,9}[.)])\s+\S")


class Step(BaseModel, frozen=True):
    """One unfoldable step: the professor's text, and where it came from."""

    index: int
    markdown: str
    start: int
    end: int


def _block_spans(text: str) -> list[tuple[int, int]]:
    """Top-level block spans, separated by blank lines. Fenced code and
    display-math regions are atomic: a blank line inside one is content, not a
    boundary."""
    lines = text.splitlines(keepends=True)
    spans: list[tuple[int, int]] = []
    offset = 0
    block_start: int | None = None
    fence: str | None = None
    in_math = False

    for line in lines:
        stripped = line.strip()
        line_start, offset = offset, offset + len(line)

        if fence is not None:
            if stripped.startswith(fence):
                fence = None
            continue
        if in_math:
            if stripped.endswith("$$"):
                in_math = False
            continue

        fence_match = _FENCE.match(line)
        if fence_match:
            if block_start is None:
                block_start = line_start
            fence = fence_match.group(1)[:3]
            continue
        if _DISPLAY_MATH.match(line):
            if block_start is None:
                block_start = line_start
            # A one-line $$ ... $$ opens and closes at once; a bare $$ opens a
            # span that runs until the closing delimiter.
            if not (len(stripped) > 2 and stripped.endswith("$$")):
                in_math = True
            continue

        if not stripped:
            if block_start is not None:
                spans.append((block_start, line_start))
                block_start = None
            continue
        if block_start is None:
            block_start = line_start

    if block_start is not None:
        spans.append((block_start, len(text)))
    return [(s, e) for s, e in spans if text[s:e].strip()]


def _list_item_spans(text: str, start: int, end: int) -> list[tuple[int, int]] | None:
    """Split a block into one span per top-level list item, or None when the
    block is not a list. Continuation lines stay with the item they belong to."""
    block = text[start:end]
    lines = block.splitlines(keepends=True)
    starts: list[int] = []
    offset = 0
    for line in lines:
        line_start, offset = offset, offset + len(line)
        match = _LIST_ITEM.match(line)
        # Only top-level markers open a new item; an indented marker is a
        # nested list and belongs to the item above it.
        if match and len(match.group(1)) == 0:
            starts.append(line_start)
    if len(starts) < 2:
        return None

    spans: list[tuple[int, int]] = []
    for position, item_start in enumerate(starts):
        item_end = starts[position + 1] if position + 1 < len(starts) else len(block)
        spans.append((start + item_start, start + item_end))
    # The first marker may be preceded by a lead-in line ("Then, in order:");
    # keep it with item one rather than dropping it.
    if starts[0] != 0:
        spans[0] = (start, spans[0][1])
    return spans


def _is_heading_only(text: str, start: int, end: int) -> bool:
    block = text[start:end].strip()
    return bool(_HEADING.match(block)) and "\n" not in block


def split_solution(text: str) -> list[Step]:
    """Split a worked solution into steps. Whitespace-only input has no steps,
    which is a real state (a variant whose solution never generated), not an
    error."""
    if not text.strip():
        return []

    spans: list[tuple[int, int]] = []
    for start, end in _block_spans(text):
        items = _list_item_spans(text, start, end)
        spans.extend(items if items is not None else [(start, end)])

    # A bare heading introduces the next step rather than standing as one.
    merged: list[tuple[int, int]] = []
    pending: int | None = None
    for start, end in spans:
        if _is_heading_only(text, start, end):
            pending = start if pending is None else pending
            continue
        merged.append((pending if pending is not None else start, end))
        pending = None
    if pending is not None:
        # A trailing heading with nothing after it is still the professor's
        # text, so it becomes its own step rather than being dropped.
        merged.append((pending, len(text)))

    return [
        Step(index=index, markdown=text[start:end].strip(), start=start, end=end)
        for index, (start, end) in enumerate(merged)
        if text[start:end].strip()
    ]


def numbered_solution(text: str) -> str:
    """The solution with its steps numbered, for the tutor's context. The same
    numbering the unfold serves the student, so "step 3" means one thing to
    both of them and a step sent into the conversation lands where the student
    meant it. The professor's text is untouched; only markers are added."""
    steps = split_solution(text)
    if not steps:
        return text
    return "\n\n".join(f"[step {step.index + 1}]\n{step.markdown}" for step in steps)
