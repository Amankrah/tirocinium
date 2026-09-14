"""Application-engineering notes for a request for quotation (milestone 10.4,
decision 0062).

Deterministic rules over the answers the student gave and the line they named.
No model call, no versioned prompt, no recorded seam, and that is a refusal
rather than a saving: engineering advice to a student who cannot yet judge it
is the worst possible place for a fluent paraphrase of a plausible-sounding
rule. What is here is authored, reviewable and diffable, and is wrong only in
the ways someone chose.

The rules are total. Every combination of answers returns at least one note,
because a vendor who replies with nothing has told the student that their
request was complete, which it rarely is.
"""

from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum

from pydantic import BaseModel, Field

from app.marketplace.catalogue import UNIT_LABELS, Catalogue, CatalogueLine
from app.marketplace.indices import money


class Volume(StrEnum):
    PROTOTYPE = "prototype"
    SMALL_BATCH = "small_batch"
    PRODUCTION = "production"
    HIGH_VOLUME = "high_volume"


class Environment(StrEnum):
    INDOOR = "indoor"
    OUTDOOR = "outdoor"
    WASHDOWN = "washdown"
    CHEMICAL = "chemical"
    ELEVATED_TEMPERATURE = "elevated_temperature"
    BURIED = "buried"


class Certification(StrEnum):
    NONE = "none"
    MILL_TEST_REPORT = "mill_test_report"
    SANITARY_3A = "sanitary_3a"
    PRESSURE_CODE = "pressure_code"
    STRUCTURAL = "structural"


VOLUME_LABELS = {
    Volume.PROTOTYPE: "Prototype, 1 to 5 pieces",
    Volume.SMALL_BATCH: "Small batch, 10 to 100",
    Volume.PRODUCTION: "Production, 1 000 to 10 000",
    Volume.HIGH_VOLUME: "High volume, over 50 000",
}

ENVIRONMENT_LABELS = {
    Environment.INDOOR: "Indoor, dry, ambient",
    Environment.OUTDOOR: "Outdoor, Qu\u00e9bec climate (\u221235 to +35 \u00b0C)",
    Environment.WASHDOWN: "Wet or wash-down, food contact",
    Environment.CHEMICAL: "Chemically aggressive (fertiliser, manure, silage effluent)",
    Environment.ELEVATED_TEMPERATURE: "Elevated temperature, above 100 \u00b0C",
    Environment.BURIED: "Buried or immersed",
}

CERTIFICATION_LABELS = {
    Certification.NONE: "None, internal prototype",
    Certification.MILL_TEST_REPORT: "Mill test report (CMTR)",
    Certification.SANITARY_3A: "3-A sanitary / food contact",
    Certification.PRESSURE_CODE: "Pressure code (ASME / CSA B51)",
    Certification.STRUCTURAL: "Structural (CSA S16 / S136)",
}


class RfqIn(BaseModel):
    """What a supplier would need answered before putting a number on paper.

    There is no name field and there never will be: a seat is anonymous, and a
    form that asks a student to identify themselves would be the one place on
    the platform that collects a person.
    """

    sku: str | None = Field(default=None, max_length=64)
    component: str = Field(default="", max_length=200)
    quantity: str = Field(default="", max_length=80)
    volume: Volume = Volume.PROTOTYPE
    environment: Environment = Environment.INDOOR
    certification: Certification = Certification.NONE
    tolerance: str = Field(default="", max_length=300)
    notes: str = Field(default="", max_length=1000)


class AdviceNote(BaseModel):
    """One note, and the rule that produced it. The `rule` id is what makes
    this reviewable: a professor who disagrees with a note can name it."""

    rule: str
    text: str


class RfqAdvice(BaseModel):
    notes: list[AdviceNote]
    # What the vendor could not price, in their words. Empty when the request
    # was complete enough to quote.
    missing: list[str]


@dataclass(frozen=True)
class _Rule:
    id: str
    applies: Callable[[RfqIn, CatalogueLine | None], bool]
    text: Callable[[RfqIn, CatalogueLine | None, Catalogue], str]


def _has(environment: Environment) -> Callable[[RfqIn, CatalogueLine | None], bool]:
    return lambda request, _line: request.environment is environment


def _cert(certification: Certification) -> Callable[[RfqIn, CatalogueLine | None], bool]:
    return lambda request, _line: request.certification is certification


def _volume(*volumes: Volume) -> Callable[[RfqIn, CatalogueLine | None], bool]:
    return lambda request, _line: request.volume in volumes


RULES: tuple[_Rule, ...] = (
    _Rule(
        "catalogue-terms",
        lambda _request, line: line is not None,
        lambda _request, line, catalogue: _terms(line, catalogue) if line else "",
    ),
    _Rule(
        "unmatched-line",
        lambda _request, line: line is None,
        lambda _request, _line, _catalogue: (
            "We could not match that to a stocked line. Please quote a catalogue "
            "SKU or an exact grade designation; \u201csteel\u201d is not something a "
            "vendor can price."
        ),
    ),
    _Rule(
        "volume-mill-order",
        _volume(Volume.PRODUCTION, Volume.HIGH_VOLUME),
        lambda _request, _line, _catalogue: (
            "At this volume we would quote from a mill order rather than "
            "service-centre stock: expect a further 8 to 15 % reduction and a 6 "
            "to 10 week lead time."
        ),
    ),
    _Rule(
        "volume-prototype-moq",
        _volume(Volume.PROTOTYPE),
        lambda _request, _line, _catalogue: (
            "At prototype volume the minimum order quantity, not the unit price, "
            "will dominate your cost. Budget for the full minimum."
        ),
    ),
    _Rule(
        "volume-tooling-amortisation",
        _volume(Volume.HIGH_VOLUME),
        lambda _request, _line, _catalogue: (
            "Above 50 000 pieces, non-recurring tooling stops being an obstacle "
            "and becomes the cheapest line in the estimate. Price a mould "
            "(MFW-INJMOLD-T) or an extrusion die (MFW-EXTRUDE-DIE) against your "
            "volume before ruling it out."
        ),
    ),
    _Rule(
        "cert-3a",
        _cert(Certification.SANITARY_3A),
        lambda _request, _line, _catalogue: (
            "3-A compliance requires a documented surface finish (Ra \u2264 0.8 "
            "\u00b5m on product contact), orbital welding with recorded coupons, "
            "and post-fabrication passivation. Add MFW-ORBITAL-W and "
            "MFW-PASSIVATE to your cost model."
        ),
    ),
    _Rule(
        "cert-cmtr",
        _cert(Certification.MILL_TEST_REPORT),
        lambda _request, _line, catalogue: (
            "Mill certification is "
            f"{_price_of(catalogue, 'MFW-CERT-CMTR')} per heat (MFW-CERT-CMTR) "
            "and must be ordered with the material: retrieving a certificate "
            "after the heat is consumed is often impossible."
        ),
    ),
    _Rule(
        "cert-pressure",
        _cert(Certification.PRESSURE_CODE),
        lambda _request, _line, _catalogue: (
            "Pressure-code work requires a qualified welding procedure, a "
            "certified welder, and volumetric NDT of every full-penetration weld "
            "(MFW-NDT-UT). That typically adds 20 to 35 % to fabrication cost."
        ),
    ),
    _Rule(
        "cert-structural",
        _cert(Certification.STRUCTURAL),
        lambda _request, _line, _catalogue: (
            "Structural certification puts your connections, not your material, "
            "on the critical path: fabricator qualification to CSA W47.1 and "
            "stamped connection details. Specify the steel grade by its CSA "
            "designation, not by a trade name."
        ),
    ),
    _Rule(
        "env-chemical",
        _has(Environment.CHEMICAL),
        lambda _request, _line, _catalogue: (
            "For fertiliser, manure and silage effluent service we would steer "
            "you away from galvanised steel: zinc is consumed rapidly by ammonia "
            "and organic acids. Consider 316L, FRP, or a polymer liner."
        ),
    ),
    _Rule(
        "env-outdoor",
        _has(Environment.OUTDOOR),
        lambda _request, _line, _catalogue: (
            "At \u221235 \u00b0C, verify the Charpy impact requirement for your "
            "grade. Ordinary A36 carries no low-temperature toughness guarantee; "
            "specify CSA G40.21 category 3 or 4 if fracture matters."
        ),
    ),
    _Rule(
        "env-washdown",
        _has(Environment.WASHDOWN),
        lambda _request, _line, _catalogue: (
            "Food-contact service constrains you to the approved materials "
            "flagged in the catalogue. Elastomer selection matters as much as "
            "the metal: EPDM handles steam and caustic but swells in fats."
        ),
    ),
    _Rule(
        "env-elevated",
        _has(Environment.ELEVATED_TEMPERATURE),
        lambda _request, _line, _catalogue: (
            "Above 100 \u00b0C, polymer pressure ratings are the trap. Every "
            "rating in this catalogue is quoted at 23 \u00b0C and de-rates "
            "sharply; PVC is out at 60 \u00b0C, and CPVC or PEX buys you 93 "
            "\u00b0C. Check the ceiling before the price."
        ),
    ),
    _Rule(
        "env-buried",
        _has(Environment.BURIED),
        lambda _request, _line, _catalogue: (
            "Buried and immersed service is decided at the joints, not the pipe. "
            "Fusion-welded HDPE gives a joint stronger than the pipe wall; a "
            "solvent-cemented PVC joint carries no tensile load at all and needs "
            "thrust restraint at every change of direction."
        ),
    ),
    _Rule(
        "service-only-basket",
        lambda _request, line: line is not None and line.service,
        lambda _request, _line, _catalogue: (
            "You have named a process, not a material. Shop time is billed in "
            "0.25 h increments with a one-hour minimum, and we will need the "
            "material supplied or quoted separately before this becomes a price."
        ),
    ),
    _Rule(
        "tolerance-unstated",
        lambda request, line: (
            not request.tolerance.strip() and line is not None and not line.service
        ),
        lambda _request, _line, _catalogue: (
            "No tolerance or finish requirement was stated. We will quote to "
            "mill tolerance and an as-supplied finish, which is the cheapest "
            "thing we can assume and rarely what a drawing means."
        ),
    ),
    _Rule(
        "galvanic-pairing",
        lambda request, line: (
            line is not None
            and line.supplier == "BSA"
            and request.environment
            in (Environment.OUTDOOR, Environment.WASHDOWN, Environment.CHEMICAL, Environment.BURIED)
        ),
        lambda _request, _line, _catalogue: (
            "A stainless part in a wet joint with plain or galvanised steel "
            "makes the steel the anode, and it will dissolve. Isolate the "
            "faying surfaces or take the whole joint to the same alloy family."
        ),
    ),
)


def advise(catalogue: Catalogue, request: RfqIn) -> RfqAdvice:
    """Answer a request for quotation. Deterministic: the same request against
    the same catalogue always produces the same notes in the same order."""
    line = catalogue.line(request.sku.strip().upper()) if request.sku else None
    notes = [
        AdviceNote(rule=rule.id, text=rule.text(request, line, catalogue))
        for rule in RULES
        if rule.applies(request, line)
    ]
    missing: list[str] = []
    if not request.sku or not request.sku.strip():
        missing.append("the material or catalogue line to price")
    if not request.quantity.strip():
        missing.append("a quantity and unit")
    return RfqAdvice(notes=notes, missing=missing)


def _terms(line: CatalogueLine, catalogue: Catalogue) -> str:
    """The commercial reply: what this line costs, where it ships from, and
    what a real order of it would have to clear."""
    supplier = catalogue.supplier(line.supplier)
    unit = UNIT_LABELS.get(line.unit, line.unit)
    parts = [
        f"Catalogue price for {line.name} is "
        f"{money(line.list_price_cents)} per {unit}, ex-works "
        f"{supplier.city if supplier else 'our works'}, minimum order "
        f"{line.moq:g} {unit}, {line.lead_days} working days.",
    ]
    if line.cut_fee_cents:
        parts.append(f"Cut-to-length is charged at {money(line.cut_fee_cents)} per cut.")
    tiers = catalogue.price_breaks.get(line.unit, []) if not line.service else []
    if tiers:
        first_qty, first_pct = tiers[0]
        last_qty, last_pct = tiers[-1]
        parts.append(
            f"Volume breaks begin at {first_qty:g} {unit} (\u2212{first_pct} %) and "
            f"reach \u2212{last_pct} % at {last_qty:g} {unit}.",
        )
    parts.append(
        "Your quoted price will differ from this list figure: it is struck "
        "against your own project.",
    )
    return " ".join(parts)


def _price_of(catalogue: Catalogue, sku: str) -> str:
    line = catalogue.line(sku)
    return money(line.list_price_cents) if line else "quoted separately"
