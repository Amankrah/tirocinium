"""Derive bree-216 catalogue v2 from v1 (decision 0108, catalogue changelog v2).

A catalogue revision is a new file, never an edit in place, because a course
is pinned to an exact version and an issued quotation names the version it was
struck against. This script is the whole of the difference between v1 and v2,
written as data so the corrections can be read, argued with and re-run: the
product owner asked for the material details and the quoting process to be
held to what an engineer actually meets, and an audit of v1 against handbook
values and section geometry found the errors below.

    .venv/bin/python scripts/revise_catalogue_v2.py

Re-running rewrites v2.json identically. Nothing here touches v1.json.
"""

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent / "catalogue" / "bree-216"

# Mass per metre recomputed from the stated section and density (A500 tables
# agree to the second decimal). v1 carried the 76 mm tube's mass from its
# source's 3 x 3 x 1/4 inch line while the spec said 4.8 mm, so the spec moves
# to the wall the mass is true for; the 50 x 4.8 mass was simply wrong.
MASSES: dict[str, float] = {
    "LMS-HSS-5048": 6.4,
    "BSA-2205-TUBE": 2.38,
}
SPECS: dict[str, str] = {
    "LMS-HSS-7648": "76 \u00d7 76 \u00d7 6.4 mm · 6.1 m",
    # Schedule 80 CPVC is 400 psi at 23 °C and de-rates to a quarter at 82.
    "CPP-CPVC-50": "50 mm (2 in) · 100 psi @ 82 °C",
    "MFW-MANUAL-HR": "Shop rate, 0.25 h increments",
}

# The coating services were priced per square decimetre, as Vulcan's own
# policy says, but sold per square metre, so a quoted area came out a hundred
# times too cheap. The unit of sale stays the square metre (the price breaks
# are keyed on it) and the figure becomes the per-metre one; the minimum stays
# five square decimetres. Electropolishing had the same mismatch at a job-shop
# rate of about two dollars per square decimetre.
PER_SQUARE_METRE: dict[str, tuple[int, str]] = {
    "VHM-TIN-COAT": (340_000, "Per m² of coated surface ($34.00 per dm²), 5 dm² minimum"),
    "VHM-WCCO-HVOF": (920_000, "Per m² of coated surface ($92.00 per dm²), 5 dm² minimum"),
    "VHM-DLC-COAT": (580_000, "Per m² of coated surface ($58.00 per dm²), 5 dm² minimum"),
    "VHM-CR-PLATE": (260_000, "Per m² of coated surface ($26.00 per dm²), 10 dm² minimum"),
    "MFW-ELECTROPOL": (19_500, "Per m² of surface ($1.95 per dm²), 5 dm² minimum"),
}
SERVICES_MISFILED = ("VHM-TIN-COAT", "VHM-WCCO-HVOF", "VHM-DLC-COAT", "VHM-CR-PLATE")

# A fabricated rotational mould for tanks to 2000 L is a multi-tonne tool; the
# v1 figure bought a small bin mould. Still a fraction of a production
# injection mould of comparable part size, which is the teaching point.
PRICES: dict[str, int] = {
    "MFW-ROTOMOLD": 1_850_000,
    "MFW-ELECTROPOL": 19_500,
}

# Minimum orders aligned with each supplier's own minimum_order_note: one full
# length on structural sections, 25 kg on Laurentian plate and sheet, 10 kg on
# Boréal sheet and plate, one piece on Vulcan blanks.
MOQS: dict[str, float] = {
    "LMS-HSS-5032": 6.1,
    "LMS-HSS-5048": 6.1,
    "LMS-HSS-7648": 6.1,
    "LMS-PIPE-S40-50": 6.4,
    "LMS-6063-ANG": 4.9,
    "LMS-6061-TUBE": 4.9,
    "LMS-GALV-SH10": 25,
    "LMS-6061-PL06": 25,
    "LMS-5052-SH": 25,
    "LMS-7075-PL": 25,
    "BSA-904L": 10,
    "BSA-316L-HX": 10,
    "BSA-NI200-SH": 10,
    "BSA-TI-GR2": 10,
    "VHM-D2-PL": 8.3,
    "VHM-A2-PL": 8.5,
    "VHM-S7-PL": 8.5,
    "VHM-H13-PL": 8.4,
    "VHM-M2-HSS": 1.2,
}

# Six-metre straight lengths are a long load for freight exactly as the three
# metre bars already were.
OVERSIZE = (
    "CPP-HDPE-50",
    "CPP-HDPE-100",
    "CPP-HDPE-200",
    "CPP-PVC-S40-50",
    "CPP-PVC-S40-100",
    "CPP-PVC-S80-50",
    "CPP-CPVC-50",
)

# Black PE4710 pipe is fully UV-stabilised, as the HDPE-50 copy itself says;
# the same PVC compound carried two different ratings.
UV: dict[str, int] = {
    "CPP-HDPE-25": 5,
    "CPP-HDPE-50": 5,
    "CPP-HDPE-100": 5,
    "CPP-HDPE-200": 5,
    "CPP-HDPE-COIL": 5,
    "CPP-PVC-S80-50": 1,
}

# Two steels carried their heat-treated properties while the spec and the
# fabrication note described the bar as bought. The as-supplied figures go in
# the properties, and the description keeps the hardened figures as what the
# heat treatment buys, so neither number is lost.
PROPERTIES: dict[str, dict[str, Any]] = {
    "LMS-5160-SPR": {"sy": 275, "su": 725, "el": 17, "hb": "200 HB"},
    "LMS-1045-HR": {"sy": 310, "su": 565, "el": 16, "hb": "163 HB"},
}

# Teaching copy whose stated comparison did not follow from the figures on the
# same line. Each rewrite keeps the point the author was making where the
# figures support it, and states the figure they do support where not.
DESCRIPTIONS: dict[str, str] = {
    "LMS-HSS-5048": (
        "Heavier wall for columns and highly loaded rafters. Going from 3.2 to 4.8 mm "
        "wall raises mass about 30 % and second moment of area about 35 %, so the "
        "heavier wall buys stiffness only in proportion to its mass: a bigger, thinner "
        "tube is usually the more efficient answer."
    ),
    "LMS-HSS-7648": (
        "Main-column section for wide-span greenhouse and silo structures. Section "
        "modulus is roughly three times the 50 \u00d7 4.8 tube for about 2.2 times the "
        "mass, a good illustration of why depth beats mass in bending."
    ),
    "TFC-FRP-TUBE50": (
        "Set this against the galvanised HSS and the aluminium tube of the same nominal "
        "size. It will never corrode and is non-conductive, but it is not light: at "
        "1.90 kg/m it is heavier than the 6061 tube, and with a modulus of 17 GPa "
        "against 200 for steel the frame will be deflection-governed, not "
        "strength-governed."
    ),
    "TFC-CF-200": (
        "Ten times the price of E-glass for about three times the fibre modulus. "
        "Include it in your Pugh chart as the high-performance benchmark, then be "
        "honest about whether the application can justify the cost and the 280 MJ/kg "
        "embodied energy."
    ),
    "VHM-AL2O3-PL": (
        "Harder than any steel, chemically inert, an electrical insulator, and usable "
        "to 1700 °C. It is also brittle, with a fracture toughness of 4 MPa·m^0.5, "
        "about a thirtieth of mild steel, so it must never see tensile or bending stress."
    ),
    "TFC-CSM-450": (
        "Randomly oriented short fibres bound with a styrene-soluble binder. Properties "
        "are equal in all directions but low: a hand-laid CSM laminate is only about "
        "30 % glass by mass, under 20 % by volume. It is the cheapest way to build "
        "thickness and is what most FRP tanks are made of."
    ),
    "TFC-JUTE-350": (
        "The cheapest natural reinforcement and among the lowest embodied energies of "
        "any fibre here at about 5.5 MJ/kg. Properties are modest and moisture "
        "sensitivity is high, but for a non-structural biocomposite panel core it is "
        "hard to beat on a life-cycle basis."
    ),
    "TFC-HEMP-400": (
        "Non-woven hemp from processing residue, the definition of an agricultural "
        "waste stream turned into a structural material. Lower properties than woven "
        "flax for about two thirds of the price and even lower embodied energy."
    ),
    "LMS-HSS-5032": (
        "The greenhouse and equipment-frame standard. Closed section gives high "
        "torsional stiffness for its mass, and the hot-dip galvanising survives humid "
        "growing environments far better than painted steel."
    ),
    "LMS-5160-SPR": (
        "Chromium spring steel, the leaf-spring alloy, supplied hot-rolled and soft "
        "enough to cut and form. Quenched and tempered it reaches about 1450 MPa yield "
        "and 1585 MPa tensile at 45 to 50 HRC with the ability to absorb repeated "
        "impact without cracking, which is why chipper knives and cultivator shanks "
        "are made from it. Price the heat treatment (MFW-HT-QT) with the bar."
    ),
    "LMS-1045-HR": (
        "The workhorse shafting steel, supplied hot-rolled at about 163 HB. "
        "Quench-and-temper takes it to roughly 300 HB and 450 MPa yield, and it flame- "
        "or induction-hardens locally for journals and wear pads."
    ),
    "MFW-LASER-HR": (
        "Fast, narrow kerf, near-zero taper and a very small heat-affected zone. A "
        "fibre source cuts aluminium and copper to moderate thickness, with more "
        "dross than on steel; it cannot cut any non-metal."
    ),
}
FABRICATION: dict[str, str] = {
    "VHM-WC6-INS": (
        "Silver-brazed to a steel body with a stress-relieving shim to accommodate the "
        "better than two-fold mismatch in thermal expansion, then diamond ground."
    ),
    "LMS-AR400": (
        "Plasma, laser or oxy-fuel cut; the heat-affected zone softens a few "
        "millimetres back from the edge, so finish-machine cut edges that will see "
        "wear. Weld with low-hydrogen consumables and controlled interpass temperature."
    ),
    "LMS-AR500": (
        "Plasma, laser or waterjet cut; waterjet leaves no softened zone. Bend radii "
        "must be at least 4\u00d7 thickness. Weld with strict preheat."
    ),
    "LMS-REBAR-15M": (
        "Shear cut and bent cold on a rebar bender; lap-spliced as a rule, and welded "
        "only to a qualified procedure because this is the W grade."
    ),
}


def _spec_length_m(spec: str) -> float | None:
    found = re.search(r"·\s*([\d.]+)\s*m\b", spec)
    return float(found.group(1)) if found else None


def revise(v1: dict[str, Any]) -> dict[str, Any]:
    v2: dict[str, Any] = json.loads(json.dumps(v1))
    v2["version"] = 2
    by_sku = {line["sku"]: line for line in v2["lines"]}
    for sku, mass in MASSES.items():
        by_sku[sku]["kg_per_unit"] = mass
    for sku, spec in SPECS.items():
        by_sku[sku]["spec"] = spec
    for sku, (price, spec) in PER_SQUARE_METRE.items():
        by_sku[sku]["list_price_cents"] = price
        by_sku[sku]["spec"] = spec
        by_sku[sku]["moq"] = 0.1 if sku == "VHM-CR-PLATE" else 0.05
    for sku in SERVICES_MISFILED:
        by_sku[sku]["service"] = True
    for sku, price in PRICES.items():
        by_sku[sku]["list_price_cents"] = price
    for sku, moq in MOQS.items():
        line = by_sku[sku]
        if line["unit"] == "m":
            length = _spec_length_m(line["spec"])
            assert length == moq, (sku, length, moq)
        line["moq"] = moq
    for sku in OVERSIZE:
        by_sku[sku]["oversize"] = True
    for sku, uv in UV.items():
        by_sku[sku]["properties"]["uv"] = uv
    for sku, props in PROPERTIES.items():
        by_sku[sku]["properties"].update(props)
    for sku, text in DESCRIPTIONS.items():
        by_sku[sku]["description"] = text
    for sku, text in FABRICATION.items():
        by_sku[sku]["fabrication"] = text
    return v2


def main() -> None:
    v1 = json.loads((ROOT / "v1.json").read_text(encoding="utf-8"))
    v2 = revise(v1)
    (ROOT / "v2.json").write_text(
        json.dumps(v2, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    changed = sum(1 for a, b in zip(v1["lines"], v2["lines"], strict=True) if a != b)
    print(f"wrote {ROOT / 'v2.json'}: {changed} of {len(v2['lines'])} lines changed")


if __name__ == "__main__":
    main()
