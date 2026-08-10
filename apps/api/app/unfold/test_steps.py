"""The solution stepper (milestone 8.4).

The split only cuts, never rewrites, so the property that matters most is
fidelity: whatever the professor wrote comes back out of the steps unchanged.
Everything else here is about cutting in sensible places and refusing to cut
inside notation.
"""

import pytest

from app.unfold.steps import numbered_solution, split_solution


def assert_faithful(text: str) -> list[str]:
    """The fidelity property, asserted on every example in this module: spans
    are ordered, non-overlapping, exactly the step text, and separated only by
    whitespace. No character of the professor's content is lost, moved, or
    altered by being split."""
    steps = split_solution(text)
    cursor = 0
    for step in steps:
        assert step.start >= cursor, "spans overlap or run backwards"
        assert text[cursor : step.start].strip() == "", "content dropped between steps"
        assert text[step.start : step.end] .strip() == step.markdown
        cursor = step.end
    assert text[cursor:].strip() == "", "content dropped after the last step"
    assert [s.index for s in steps] == list(range(len(steps)))
    return [s.markdown for s in steps]


def test_paragraphs_become_steps() -> None:
    text = "First we find the current.\n\nThen we find the power.\n\nSo P = 30 mW.\n"

    assert assert_faithful(text) == [
        "First we find the current.",
        "Then we find the power.",
        "So P = 30 mW.",
    ]


def test_a_numbered_list_becomes_one_step_per_item() -> None:
    text = (
        "1. Apply Ohm's law to the loop.\n"
        "2. Substitute the supply voltage.\n"
        "3. Convert to milliamps.\n"
    )

    assert assert_faithful(text) == [
        "1. Apply Ohm's law to the loop.",
        "2. Substitute the supply voltage.",
        "3. Convert to milliamps.",
    ]


def test_a_lead_in_line_stays_with_the_first_item() -> None:
    text = "Work it in order:\n1. Find I.\n2. Find P.\n"

    assert assert_faithful(text) == ["Work it in order:\n1. Find I.", "2. Find P."]


def test_a_nested_list_stays_with_its_parent_item() -> None:
    text = "1. Find I.\n   - by Ohm's law\n   - in amps\n2. Find P.\n"

    steps = assert_faithful(text)
    assert len(steps) == 2
    assert "by Ohm's law" in steps[0]
    assert steps[1] == "2. Find P."


def test_a_heading_introduces_the_next_step_rather_than_standing_alone() -> None:
    text = "## Part (a)\n\nApply Ohm's law.\n\n## Part (b)\n\nApply the power law.\n"

    steps = assert_faithful(text)
    assert steps == [
        "## Part (a)\n\nApply Ohm's law.",
        "## Part (b)\n\nApply the power law.",
    ]


def test_a_fenced_code_block_is_never_split() -> None:
    """A blank line inside a fence is content, not a boundary."""
    text = (
        "Compute it:\n\n"
        "```python\n"
        "i = v / r\n"
        "\n"
        "p = i * i * r\n"
        "```\n\n"
        "So P = 30 mW.\n"
    )

    steps = assert_faithful(text)
    assert len(steps) == 3
    assert steps[1].startswith("```python")
    assert steps[1].endswith("```")
    assert "p = i * i * r" in steps[1]


def test_display_math_is_never_split() -> None:
    text = "By Ohm's law:\n\n$$\nI = \\frac{V}{R}\n\n= 2.553\\,\\mathrm{mA}\n$$\n\nDone.\n"

    steps = assert_faithful(text)
    assert len(steps) == 3
    assert steps[1].startswith("$$")
    assert steps[1].endswith("$$")
    assert "\\frac{V}{R}" in steps[1]


def test_single_line_display_math_does_not_swallow_the_rest() -> None:
    text = "$$I = V/R$$\n\nSo I = 2.553 mA.\n"

    assert assert_faithful(text) == ["$$I = V/R$$", "So I = 2.553 mA."]


def test_a_figure_token_stays_inside_its_step() -> None:
    """Figures are pixels at the position the professor put them: the token
    travels with the text around it and is never lifted out."""
    text = (
        "Read the loop current from the schematic.\n\n"
        "![Figure 2](fig://41)\n\n"
        "Then apply the power law.\n"
    )

    steps = assert_faithful(text)
    assert "![Figure 2](fig://41)" in steps[1]
    assert sum("fig://41" in step for step in steps) == 1


def test_a_figure_inline_in_a_paragraph_is_not_cut_out() -> None:
    text = "See ![Figure 2](fig://41) for the loop, then apply Ohm's law.\n"

    steps = assert_faithful(text)
    assert steps == ["See ![Figure 2](fig://41) for the loop, then apply Ohm's law."]


@pytest.mark.parametrize("text", ["", "   ", "\n\n\n"])
def test_an_empty_solution_has_no_steps(text: str) -> None:
    assert split_solution(text) == []
    assert assert_faithful(text) == []


def test_a_single_paragraph_is_one_step() -> None:
    assert assert_faithful("By Ohm's law, I = V/R = 2.553 mA.") == [
        "By Ohm's law, I = V/R = 2.553 mA."
    ]


def test_a_trailing_heading_is_not_dropped() -> None:
    text = "Apply Ohm's law.\n\n## Left as an exercise\n"

    steps = assert_faithful(text)
    assert steps[-1].strip() == "## Left as an exercise"


def test_windows_line_endings_survive_the_split() -> None:
    text = "First step.\r\n\r\nSecond step.\r\n"

    assert assert_faithful(text) == ["First step.", "Second step."]


# ------------------------------------------------------ the tutor's numbering


def test_numbering_marks_steps_without_touching_the_text() -> None:
    """The tutor sees the same numbering the student unfolds, so a step sent
    into the conversation lands where the student meant it."""
    text = "Find I.\n\nFind P.\n"

    numbered = numbered_solution(text)

    assert "[step 1]" in numbered
    assert "[step 2]" in numbered
    assert "Find I." in numbered
    assert "Find P." in numbered
    # Numbering adds markers; it never edits the professor's words.
    for step in split_solution(text):
        assert step.markdown in numbered


def test_numbering_an_empty_solution_returns_it_unchanged() -> None:
    assert numbered_solution("") == ""
    assert numbered_solution("   ") == "   "
