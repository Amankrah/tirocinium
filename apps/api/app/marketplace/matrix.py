"""The weighted selection matrix (decision 0112).

A material-selection report is marked on its weighting, not on its pick. The
matrix makes that weighting explicit: the student names the criteria they care
about and how much, and the candidates are scored against them from the same
figures the comparison table shows. Scoring is done here, on the server, for
the reason money is: a score the browser worked out would be a second opinion
the student could not account for, and the stored selection carries the
server's figures.

The arithmetic is the plain weighted-sum Pugh variant every selection course
teaches. Each criterion is normalised across the candidate set to 0..1 in the
direction that is better (min-max, so the best candidate on a criterion scores
1 and the worst 0), multiplied by its weight, and the sum is divided by the sum
of weights, so a score reads as a percentage of the best possible. A candidate
with no figure for a weighted criterion scores 0 on it and the gap is named,
never hidden: a missing figure is a finding.
"""

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field

from app.marketplace.catalogue import Catalogue
from app.marketplace.indices import (
    ROWS,
    Better,
    CompareRow,
    LineMetrics,
    _build_row,
    line_metrics,
)

MAX_WEIGHT = 5
MIN_CANDIDATES = 2
MAX_CANDIDATES = 5

Group = Literal["cost", "performance", "durability", "environment", "supply"]


@dataclass(frozen=True)
class Criterion:
    key: str
    label: str
    group: Group
    better: Better
    # The comparison row this criterion reads, so the figure on the matrix is
    # the figure on the comparison and the two can never disagree.
    row: str


CRITERIA: tuple[Criterion, ...] = (
    Criterion("cost", "Cost per kg", "cost", "lower", "price_per_kg"),
    Criterion("strength", "Specific strength", "performance", "higher", "specific_strength"),
    Criterion("stiffness", "Specific stiffness", "performance", "higher", "specific_stiffness"),
    Criterion("toughness", "Fracture toughness", "performance", "higher", "toughness"),
    Criterion("temperature", "Max service temperature", "durability", "higher", "max_temp"),
    Criterion("corrosion", "Corrosion resistance", "durability", "higher", "corrosion"),
    Criterion("uv", "UV resistance", "durability", "higher", "uv"),
    Criterion("embodied_energy", "Embodied energy", "environment", "lower", "embodied_energy"),
    Criterion("carbon", "Carbon footprint", "environment", "lower", "carbon"),
    Criterion("recyclability", "Recyclability", "environment", "higher", "recyclability"),
    Criterion("lead", "Lead time", "supply", "lower", "lead"),
)
CRITERION_KEYS = tuple(criterion.key for criterion in CRITERIA)
_BY_KEY = {criterion.key: criterion for criterion in CRITERIA}
_ROW_SPECS = {spec.key: spec for spec in ROWS}


class Weights(BaseModel):
    """Student-set weights, 0 to 5 per criterion. A criterion left out weighs
    nothing. At least one must weigh something, or there is no matrix."""

    values: dict[str, int] = Field(default_factory=dict)

    def normalised(self) -> dict[str, int]:
        cleaned: dict[str, int] = {}
        for key, weight in self.values.items():
            if key not in _BY_KEY:
                raise ValueError(f"{key} is not a matrix criterion")
            if not 0 <= weight <= MAX_WEIGHT:
                raise ValueError(f"a weight is 0 to {MAX_WEIGHT}, not {weight}")
            if weight:
                cleaned[key] = weight
        if not cleaned:
            raise ValueError("every criterion weighs nothing")
        return cleaned


class MatrixCell(BaseModel):
    sku: str
    value: float | None
    display: str
    # 0..1 in the better direction across this candidate set; null when the
    # candidate has no figure, which scores as 0 and is reported in `missing`.
    normalised: float | None
    weighted: float


class MatrixCriterion(BaseModel):
    key: str
    label: str
    group: Group
    better: Better
    weight: int
    cells: list[MatrixCell]


class MatrixScore(BaseModel):
    sku: str
    # Percent of the best possible under this weighting.
    score: float
    rank: int
    missing: list[str]


class MatrixOut(BaseModel):
    skus: list[str]
    weights: dict[str, int]
    criteria: list[MatrixCriterion]
    scores: list[MatrixScore]


def criteria_out() -> list[dict[str, str]]:
    """The criteria a client can weight, for building the controls."""
    return [
        {"key": c.key, "label": c.label, "group": c.group, "better": c.better} for c in CRITERIA
    ]


def _normalise(values: list[float | None], better: Better) -> list[float | None]:
    present = [value for value in values if value is not None]
    if not present:
        return [None for _ in values]
    low, high = min(present), max(present)
    out: list[float | None] = []
    for value in values:
        if value is None:
            out.append(None)
        elif high == low:
            out.append(1.0)
        else:
            scaled = (value - low) / (high - low)
            out.append(scaled if better == "higher" else 1.0 - scaled)
    return out


def score_matrix(
    catalogue: Catalogue,
    prices: dict[str, int],
    skus: list[str],
    weights: Weights,
) -> MatrixOut:
    """Score up to five candidates under the student's weights. An unknown or
    repeated SKU is dropped rather than raising, as the comparison does; fewer
    than two survivors is an error, because a matrix of one is not a choice."""
    cleaned = weights.normalised()
    seen: list[str] = []
    metrics: list[LineMetrics] = []
    for sku in skus:
        line = catalogue.line(sku)
        if line is None or sku in seen:
            continue
        seen.append(sku)
        metrics.append(line_metrics(catalogue, line, prices[sku]))
        if len(metrics) == MAX_CANDIDATES:
            break
    if len(metrics) < MIN_CANDIDATES:
        raise ValueError(f"a matrix needs at least {MIN_CANDIDATES} stocked candidates")

    total_weight = sum(cleaned.values())
    totals = dict.fromkeys(seen, 0.0)
    missing: dict[str, list[str]] = {sku: [] for sku in seen}
    criteria: list[MatrixCriterion] = []
    for criterion in CRITERIA:
        weight = cleaned.get(criterion.key, 0)
        if not weight:
            continue
        row: CompareRow = _build_row(_ROW_SPECS[criterion.row], metrics)
        values = [cell.value for cell in row.cells]
        scaled = _normalise(values, criterion.better)
        cells: list[MatrixCell] = []
        for cell, normalised in zip(row.cells, scaled, strict=True):
            weighted = (normalised or 0.0) * weight
            totals[cell.sku] += weighted
            if normalised is None:
                missing[cell.sku].append(criterion.key)
            cells.append(
                MatrixCell(
                    sku=cell.sku,
                    value=cell.value,
                    display=cell.display,
                    normalised=normalised,
                    weighted=round(weighted, 3),
                )
            )
        criteria.append(
            MatrixCriterion(
                key=criterion.key,
                label=criterion.label,
                group=criterion.group,
                better=criterion.better,
                weight=weight,
                cells=cells,
            )
        )

    ordered = sorted(seen, key=lambda sku: -totals[sku])
    scores = [
        MatrixScore(
            sku=sku,
            score=round(100 * totals[sku] / total_weight, 1),
            rank=ordered.index(sku) + 1,
            missing=missing[sku],
        )
        for sku in seen
    ]
    return MatrixOut(skus=seen, weights=cleaned, criteria=criteria, scores=scores)
