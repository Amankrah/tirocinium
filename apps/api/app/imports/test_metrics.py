"""Milestone 4.5: the text edit distance metric (a Levenshtein distance)."""

from app.imports.metrics import edit_distance


def test_edit_distance() -> None:
    assert edit_distance("", "") == 0
    assert edit_distance("abc", "abc") == 0
    assert edit_distance("abc", "") == 3
    assert edit_distance("", "abc") == 3
    assert edit_distance("kitten", "sitting") == 3  # the classic
    assert edit_distance("ABCDE", "ABXDE") == 1  # one substitution
