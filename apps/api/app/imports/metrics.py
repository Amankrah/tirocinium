"""Extraction-accuracy metrics (backend guide section 5 Stage 3, milestone 4.5).
The text edit distance between what segmentation extracted and what the
professor confirmed is a Levenshtein distance; it is computed at confirmation,
off the request hot path (a professor action), so plain Python is fine here (the
mandated-Rust code is the numeric comparer and the mastery arithmetic, not this).
"""


def edit_distance(a: str, b: str) -> int:
    """Levenshtein distance between two strings (a two-row dynamic program).
    Character-level, so it reflects how much the professor had to correct the
    model's text."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i]
        for j, cb in enumerate(b, start=1):
            insertion = current[j - 1] + 1
            deletion = previous[j] + 1
            substitution = previous[j - 1] + (0 if ca == cb else 1)
            current.append(min(insertion, deletion, substitution))
        previous = current
    return previous[-1]
