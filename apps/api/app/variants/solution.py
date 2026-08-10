"""Reading a stored variant solution back to markdown.

The generation loop stores a variant's solution as a JSON blob carrying
`solution_md` alongside the structured final answers (milestone 5.3), while
older and hand-seeded rows hold the markdown directly. Both readers of that
column (the tutor's context assembly and the understanding unfold) need the
same tolerance, so it lives here once rather than twice.
"""

import json


def solution_markdown(blob_text: str) -> str:
    """The worked solution as markdown, whether the column holds the 5.3 JSON
    blob or bare markdown."""
    try:
        parsed = json.loads(blob_text)
    except ValueError:
        return blob_text
    if isinstance(parsed, dict):
        return str(parsed.get("solution_md", blob_text))
    return blob_text
