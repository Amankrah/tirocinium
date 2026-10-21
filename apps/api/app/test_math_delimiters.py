"""Decision 0099: the delimiter normaliser applied at import confirmation.

The case table is shared with the web renderer's `normalizeMath`, whose test
reads the same file, so the text the backend stores and the text the frontend
renders from a still-bracketed reading are produced by one rule."""

import json
from pathlib import Path

import pytest

from app.math_delimiters import normalize_math

CASES = json.loads(
    (Path(__file__).parent.parent / "tests" / "fixtures" / "math-delimiters.json").read_text()
)["cases"]


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_shared_case(case: dict[str, str]) -> None:
    assert normalize_math(case["source"]) == case["expected"]


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_normalizing_twice_changes_nothing(case: dict[str, str]) -> None:
    once = normalize_math(case["source"])
    assert normalize_math(once) == once


def test_formula_text_passes_through_exactly() -> None:
    tex = r"\rho = \frac{n A}{V_C N_A} \quad (\mathrm{g/cm^3})"
    assert normalize_math(rf"Density \({tex}\).") == f"Density ${tex}$."
