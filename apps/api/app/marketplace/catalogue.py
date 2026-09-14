"""The materials catalogue as a versioned file asset (milestone 10.1, decision
0062).

A catalogue is read-only platform content, loaded the way `app.prompts` loads a
prompt and for the same reason: it is reviewed, diffed and versioned like code,
and nothing at runtime edits it. A course pins an id and a version in the
directory, so publishing v2 never moves a running course's prices under its
students mid-term.

The JSON stores each property under the short key the course author wrote
(`sy`, `rho`, `kic`); the models expose the readable name, because those names
cross the OpenAPI seam and land in the frontend's generated types.
"""

import json
from functools import cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CATALOGUE_ROOT = Path(__file__).resolve().parent.parent.parent / "catalogue"

Unit = Literal["kg", "m", "m2", "L", "ea", "hr"]
Stock = Literal["in", "lo", "oo"]

UNIT_LABELS: dict[str, str] = {
    "kg": "kg",
    "m": "m",
    "m2": "m\u00b2",
    "L": "L",
    "ea": "ea",
    "hr": "h",
}

# Properties where a zero in the source means "does not apply" rather than a
# measurement: a fabrication service has no density, and a ceramic has no yield
# point. They load as null so a derived index divides by nothing rather than by
# zero. Elongation, recyclability, and the two five-point ratings keep their
# zeros, because a zero there is a real and often damning measurement.
_ZERO_IS_ABSENT = frozenset(
    {"rho", "sy", "su", "E", "K", "a", "tmax", "kic", "ee"},
)


class MaterialProperties(BaseModel):
    """The fifteen figures a selection decision is argued from."""

    model_config = ConfigDict(populate_by_name=True)

    density_kg_m3: float | None = Field(default=None, validation_alias="rho")
    yield_strength_mpa: float | None = Field(default=None, validation_alias="sy")
    tensile_strength_mpa: float | None = Field(default=None, validation_alias="su")
    youngs_modulus_gpa: float | None = Field(default=None, validation_alias="E")
    elongation_percent: float | None = Field(default=None, validation_alias="el")
    fracture_toughness_mpa_m05: float | None = Field(default=None, validation_alias="kic")
    hardness: str | None = Field(default=None, validation_alias="hb")
    thermal_conductivity_w_mk: float | None = Field(default=None, validation_alias="K")
    thermal_expansion_um_mk: float | None = Field(default=None, validation_alias="a")
    max_service_temp_c: float | None = Field(default=None, validation_alias="tmax")
    corrosion_resistance: int | None = Field(default=None, validation_alias="corr")
    uv_resistance: int | None = Field(default=None, validation_alias="uv")
    food_contact: bool | None = Field(default=None, validation_alias="food")
    embodied_energy_mj_kg: float | None = Field(default=None, validation_alias="ee")
    recyclability_percent: float | None = Field(default=None, validation_alias="recy")


class Supplier(BaseModel):
    """One fictional supplier and the terms it trades on."""

    id: str
    name: str
    tagline: str
    glyph: str
    city: str
    established: int
    rating: float
    review_count: int
    shipping: str
    categories: list[str]
    blurb: str
    policy: str
    minimum_order_note: str


class CatalogueLine(BaseModel):
    """One stocked line or priced service, at its list price.

    `list_price_cents` is the anchor, never what a student is quoted: the price
    that reaches a surface is always the seeded one for their variant.
    """

    sku: str
    supplier: str
    category: str
    name: str
    spec: str
    list_price_cents: int
    unit: Unit
    kg_per_unit: float
    moq: float
    lead_days: int
    stock: Stock
    cut_fee_cents: int
    swatch: str
    volatility: float
    oversize: bool
    service: bool
    tags: list[str]
    description: str
    fabrication: str
    properties: MaterialProperties


class Brief(BaseModel):
    """A project brief: the selection factors, the families in contention, and
    the lines worth quoting first."""

    id: str
    title: str
    selection_factors: list[str]
    candidate_families: str
    shortlist: list[str]


class Tax(BaseModel):
    code: str
    rate: float


class Freight(BaseModel):
    """The consolidated-shipment estimate: a flat despatch charge, a rate on
    total mass, and a surcharge when anything on the order is a long load."""

    base_cents: int
    per_kg_cents: int
    long_item_cents: int


class Catalogue(BaseModel):
    """A whole catalogue, indexed for lookup.

    Frozen because it is a cached, process-wide asset shared by every request;
    a mutation here would be a mutation for everybody.
    """

    model_config = ConfigDict(frozen=True)

    id: str
    version: int
    title: str
    course_note: str
    currency: str
    taxes: list[Tax]
    freight: Freight
    price_breaks: dict[str, list[tuple[float, int]]]
    quote_validity_days: int
    suppliers: list[Supplier]
    lines: list[CatalogueLine]
    briefs: list[Brief]

    def line(self, sku: str) -> CatalogueLine | None:
        return _sku_index(self.id, self.version).get(sku)

    def supplier(self, supplier_id: str) -> Supplier | None:
        return _supplier_index(self.id, self.version).get(supplier_id)

    def lines_for(self, supplier_id: str) -> list[CatalogueLine]:
        return _supplier_lines(self.id, self.version).get(supplier_id, [])

    def categories_for(self, supplier_id: str) -> list[str]:
        seen: list[str] = []
        for line in self.lines_for(supplier_id):
            if line.category not in seen:
                seen.append(line.category)
        return seen


# The indexes hang off the cached loader rather than off the model, because a
# frozen model cannot memoise onto itself and rebuilding a 146-entry dict on
# every SKU lookup would be a real cost on a catalogue read.
@cache
def _sku_index(catalogue_id: str, version: int) -> dict[str, CatalogueLine]:
    return {line.sku: line for line in load_catalogue(catalogue_id, version).lines}


@cache
def _supplier_index(catalogue_id: str, version: int) -> dict[str, Supplier]:
    catalogue = load_catalogue(catalogue_id, version)
    return {supplier.id: supplier for supplier in catalogue.suppliers}


@cache
def _supplier_lines(catalogue_id: str, version: int) -> dict[str, list[CatalogueLine]]:
    grouped: dict[str, list[CatalogueLine]] = {}
    for line in load_catalogue(catalogue_id, version).lines:
        grouped.setdefault(line.supplier, []).append(line)
    return grouped


@cache
def load_catalogue(catalogue_id: str, version: int) -> Catalogue:
    """Load a catalogue by id and version. A missing file is a deployment
    error, not a runtime condition, so it raises rather than returning None."""
    path = CATALOGUE_ROOT / catalogue_id / f"v{version}.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    for line in raw["lines"]:
        line["properties"] = {
            key: value
            for key, value in line["properties"].items()
            if not (value == 0 and key in _ZERO_IS_ABSENT)
        }
    return Catalogue.model_validate(raw)


def available_catalogues() -> list[tuple[str, int]]:
    """Every catalogue asset on disk, newest version of each first. Used by the
    professor's course settings so the choice is the shipped set, not a string
    the caller invents."""
    found: list[tuple[str, int]] = []
    if not CATALOGUE_ROOT.is_dir():
        return found
    for directory in sorted(CATALOGUE_ROOT.iterdir()):
        if not directory.is_dir():
            continue
        for asset in sorted(directory.glob("v*.json"), reverse=True):
            found.append((directory.name, int(asset.stem.removeprefix("v"))))
    return found
