"""The comparison table and its derived selection indices (milestone 10.3).

The indices are computed here rather than in the browser for two reasons. They
are the substance of the exercise, so they belong where they can be tested
against hand-worked figures; and a student defending "I picked it on strength
per dollar" should be defending a number the platform stands behind.

Every index is null when any input is missing. A ceramic has no yield point and
a shop hour has no density, and a specific strength computed from a zero that
stood in for an absence would be a fabricated finding.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal, cast

from pydantic import BaseModel

from app.marketplace.catalogue import UNIT_LABELS, Catalogue, CatalogueLine

Better = Literal["lower", "higher"]

STOCK_LABELS = {"in": "In stock", "lo": "Low stock", "oo": "Backorder"}
MAX_COMPARE = 5

DASH = "\u2014"


def money(cents: float) -> str:
    return f"${cents / 100:,.2f}"


def stars(rating: int) -> str:
    return "\u2605" * rating + "\u2606" * (5 - rating)


class CompareCell(BaseModel):
    sku: str
    value: float | None
    display: str
    best: bool


class CompareRow(BaseModel):
    key: str
    label: str
    section: str
    better: Better | None
    cells: list[CompareCell]


class CompareOut(BaseModel):
    skus: list[str]
    rows: list[CompareRow]


# --------------------------------------------------------------------------
# The four derived indices, each a public function so a test can work one by
# hand without building a whole comparison.
# --------------------------------------------------------------------------


def price_per_kg_cents(line: CatalogueLine, price_cents: int) -> float | None:
    """The line's price normalised to a kilogram, which is the only basis on
    which a metre of tube and a sheet of plate can be argued about."""
    if line.kg_per_unit <= 0:
        return None
    return price_cents / line.kg_per_unit


def specific_strength(line: CatalogueLine) -> float | None:
    """Yield strength over density, in kN\u00b7m/kg: how much load a kilogram of
    this material carries."""
    sigma = line.properties.yield_strength_mpa
    rho = line.properties.density_kg_m3
    if not sigma or not rho:
        return None
    return sigma / rho * 1000


def specific_stiffness(line: CatalogueLine) -> float | None:
    """Modulus over density, in kN\u00b7m/kg. The index that decides a
    deflection-governed frame, where strength is not what runs out first."""
    modulus = line.properties.youngs_modulus_gpa
    rho = line.properties.density_kg_m3
    if not modulus or not rho:
        return None
    return modulus / rho * 1e6


def strength_per_dollar(line: CatalogueLine, price_cents: int) -> float | None:
    """Yield strength per dollar of material: strength you can afford, which is
    the index a real specification is written against."""
    sigma = line.properties.yield_strength_mpa
    rho = line.properties.density_kg_m3
    per_kg = price_per_kg_cents(line, price_cents)
    if not sigma or not rho or not per_kg:
        return None
    return sigma / (rho * per_kg / 100) * 1000


def cost_per_litre_cents(line: CatalogueLine, price_cents: int) -> float | None:
    """What a litre of the material costs. Carbide is bought by the cubic
    centimetre in practice, and this is the row that shows why comparing it on
    price per kilogram flatters it."""
    rho = line.properties.density_kg_m3
    per_kg = price_per_kg_cents(line, price_cents)
    if not rho or not per_kg:
        return None
    return per_kg * rho / 1000


# --------------------------------------------------------------------------
# One flattened record per candidate, so the table below is a list of rows and
# not a nest of conditionals.
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class LineMetrics:
    sku: str
    price_cents: float
    price_per_kg_cents: float | None
    moq: float
    lead_days: float
    density_kg_m3: float | None
    yield_strength_mpa: float | None
    tensile_strength_mpa: float | None
    youngs_modulus_gpa: float | None
    elongation_percent: float | None
    fracture_toughness_mpa_m05: float | None
    specific_strength: float | None
    specific_stiffness: float | None
    strength_per_dollar: float | None
    cost_per_litre_cents: float | None
    thermal_conductivity_w_mk: float | None
    thermal_expansion_um_mk: float | None
    max_service_temp_c: float | None
    corrosion_resistance: float | None
    uv_resistance: float | None
    embodied_energy_mj_kg: float | None
    recyclability_percent: float | None
    price_label: str
    stock_label: str
    hardness_label: str
    food_label: str
    supplier_label: str


def line_metrics(catalogue: Catalogue, line: CatalogueLine, price_cents: int) -> LineMetrics:
    properties = line.properties
    supplier = catalogue.supplier(line.supplier)
    unit_label = UNIT_LABELS.get(line.unit, line.unit)
    return LineMetrics(
        sku=line.sku,
        price_cents=float(price_cents),
        price_per_kg_cents=price_per_kg_cents(line, price_cents),
        moq=line.moq,
        lead_days=float(line.lead_days),
        density_kg_m3=properties.density_kg_m3,
        yield_strength_mpa=properties.yield_strength_mpa,
        tensile_strength_mpa=properties.tensile_strength_mpa,
        youngs_modulus_gpa=properties.youngs_modulus_gpa,
        elongation_percent=properties.elongation_percent,
        fracture_toughness_mpa_m05=properties.fracture_toughness_mpa_m05,
        specific_strength=specific_strength(line),
        specific_stiffness=specific_stiffness(line),
        strength_per_dollar=strength_per_dollar(line, price_cents),
        cost_per_litre_cents=cost_per_litre_cents(line, price_cents),
        thermal_conductivity_w_mk=properties.thermal_conductivity_w_mk,
        thermal_expansion_um_mk=properties.thermal_expansion_um_mk,
        max_service_temp_c=properties.max_service_temp_c,
        corrosion_resistance=_as_float(properties.corrosion_resistance),
        uv_resistance=_as_float(properties.uv_resistance),
        embodied_energy_mj_kg=properties.embodied_energy_mj_kg,
        recyclability_percent=properties.recyclability_percent,
        price_label=f"{money(price_cents)} / {unit_label}",
        stock_label=STOCK_LABELS.get(line.stock, line.stock),
        hardness_label=properties.hardness or DASH,
        food_label=(
            DASH
            if properties.food_contact is None
            else ("Yes" if properties.food_contact else "No")
        ),
        supplier_label=supplier.name if supplier else line.supplier,
    )


# --------------------------------------------------------------------------
# The table.
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class RowSpec:
    key: str
    label: str
    section: str
    better: Better | None
    # Exactly one of these is set. A ranked row reads a number and formats it;
    # a text row reads a pre-rendered label and is never ranked.
    number: str | None = None
    text: str | None = None
    unit: str = ""
    decimals: int = 0
    formatter: Callable[[float], str] | None = None
    # Ranked, but displayed from a pre-rendered label because the rendering
    # needs something the number does not carry. Price is the only such row:
    # every candidate sells in its own unit.
    display_from: str | None = None


COMMERCIAL = "Commercial"
MECHANICAL = "Physical and mechanical"
DERIVED = "Derived selection indices"
SERVICE = "Environment and service"
SUSTAINABILITY = "Sustainability"

ROWS: tuple[RowSpec, ...] = (
    RowSpec(
        "price",
        "Your price",
        COMMERCIAL,
        "lower",
        number="price_cents",
        display_from="price_label",
    ),
    RowSpec(
        "price_per_kg",
        "Normalised price",
        COMMERCIAL,
        "lower",
        number="price_per_kg_cents",
        formatter=lambda v: f"{money(v)} / kg",
    ),
    RowSpec("moq", "Minimum order", COMMERCIAL, "lower", number="moq", decimals=0),
    RowSpec("lead", "Lead time", COMMERCIAL, "lower", number="lead_days", unit="days"),
    RowSpec("stock", "Availability", COMMERCIAL, None, text="stock_label"),
    RowSpec("supplier", "Supplier", COMMERCIAL, None, text="supplier_label"),
    RowSpec(
        "density",
        "Density",
        MECHANICAL,
        "lower",
        number="density_kg_m3",
        unit="kg/m\u00b3",
    ),
    RowSpec(
        "yield", "Yield strength", MECHANICAL, "higher", number="yield_strength_mpa", unit="MPa"
    ),
    RowSpec(
        "tensile",
        "Tensile strength",
        MECHANICAL,
        "higher",
        number="tensile_strength_mpa",
        unit="MPa",
    ),
    RowSpec(
        "modulus",
        "Young's modulus",
        MECHANICAL,
        "higher",
        number="youngs_modulus_gpa",
        unit="GPa",
    ),
    RowSpec(
        "elongation",
        "Elongation",
        MECHANICAL,
        "higher",
        number="elongation_percent",
        unit="%",
        decimals=1,
    ),
    RowSpec(
        "toughness",
        "Fracture toughness",
        MECHANICAL,
        "higher",
        number="fracture_toughness_mpa_m05",
        unit="MPa\u00b7m\u00bd",
        decimals=1,
    ),
    RowSpec("hardness", "Hardness", MECHANICAL, None, text="hardness_label"),
    RowSpec(
        "specific_strength",
        "Specific strength \u03c3y/\u03c1",
        DERIVED,
        "higher",
        number="specific_strength",
        unit="kN\u00b7m/kg",
        decimals=1,
    ),
    RowSpec(
        "specific_stiffness",
        "Specific stiffness E/\u03c1",
        DERIVED,
        "higher",
        number="specific_stiffness",
        unit="kN\u00b7m/kg",
        decimals=1,
    ),
    RowSpec(
        "strength_per_dollar",
        "Strength per dollar",
        DERIVED,
        "higher",
        number="strength_per_dollar",
        decimals=2,
    ),
    RowSpec(
        "cost_per_litre",
        "Cost per litre of material",
        DERIVED,
        "lower",
        number="cost_per_litre_cents",
        formatter=money,
    ),
    RowSpec(
        "conductivity",
        "Thermal conductivity",
        SERVICE,
        None,
        number="thermal_conductivity_w_mk",
        unit="W/m\u00b7K",
        decimals=2,
    ),
    RowSpec(
        "expansion",
        "Thermal expansion",
        SERVICE,
        "lower",
        number="thermal_expansion_um_mk",
        unit="\u00b5m/m\u00b7K",
        decimals=1,
    ),
    RowSpec(
        "max_temp",
        "Max service temperature",
        SERVICE,
        "higher",
        number="max_service_temp_c",
        unit="\u00b0C",
    ),
    RowSpec(
        "corrosion",
        "Corrosion resistance",
        SERVICE,
        "higher",
        number="corrosion_resistance",
        formatter=lambda v: stars(int(v)),
    ),
    RowSpec(
        "uv",
        "UV resistance",
        SERVICE,
        "higher",
        number="uv_resistance",
        formatter=lambda v: stars(int(v)),
    ),
    RowSpec("food", "Food-contact approved", SERVICE, None, text="food_label"),
    RowSpec(
        "embodied_energy",
        "Embodied energy",
        SUSTAINABILITY,
        "lower",
        number="embodied_energy_mj_kg",
        unit="MJ/kg",
        decimals=1,
    ),
    RowSpec(
        "recyclability",
        "Recyclability",
        SUSTAINABILITY,
        "higher",
        number="recyclability_percent",
        unit="%",
    ),
)


def compare(catalogue: Catalogue, prices: dict[str, int], skus: list[str]) -> CompareOut:
    """Build the comparison table for up to five lines at this variant's
    prices. An unknown SKU is dropped rather than raising, so a stale link
    costs a column and never the comparison."""
    seen: list[str] = []
    metrics: list[LineMetrics] = []
    for sku in skus:
        line = catalogue.line(sku)
        if line is None or sku in seen:
            continue
        seen.append(sku)
        metrics.append(line_metrics(catalogue, line, prices[sku]))
        if len(metrics) == MAX_COMPARE:
            break

    rows = [_build_row(spec, metrics) for spec in ROWS]
    return CompareOut(skus=seen, rows=rows)


def _build_row(spec: RowSpec, metrics: list[LineMetrics]) -> CompareRow:
    cells: list[CompareCell] = []
    for record in metrics:
        if spec.text is not None:
            cells.append(
                CompareCell(
                    sku=record.sku,
                    value=None,
                    display=cast(str, getattr(record, spec.text)),
                    best=False,
                ),
            )
            continue
        value = cast("float | None", getattr(record, cast(str, spec.number)))
        display = (
            cast(str, getattr(record, spec.display_from))
            if spec.display_from is not None
            else _render(spec, value)
        )
        cells.append(
            CompareCell(sku=record.sku, value=value, display=display, best=False),
        )
    _mark_best(cells, spec.better)
    return CompareRow(
        key=spec.key,
        label=spec.label,
        section=spec.section,
        better=spec.better,
        cells=cells,
    )


def _render(spec: RowSpec, value: float | None) -> str:
    if value is None:
        return DASH
    if spec.formatter is not None:
        return spec.formatter(value)
    rendered = f"{value:,.{spec.decimals}f}"
    return f"{rendered} {spec.unit}".strip()


def _mark_best(cells: list[CompareCell], better: Better | None) -> None:
    """Mark the winning cells, and mark none at all when every candidate ties.

    A row where all five agree has nothing to say, and highlighting all of them
    would suggest it did.
    """
    if better is None:
        return
    scored = [(cell, cell.value) for cell in cells if cell.value is not None]
    if len(scored) < 2:
        return
    values = [value for _cell, value in scored]
    target = min(values) if better == "lower" else max(values)
    winners = [cell for cell, value in scored if value == target]
    if len(winners) == len(cells):
        return
    for cell in winners:
        cell.best = True


def _as_float(value: int | None) -> float | None:
    return None if value is None else float(value)
