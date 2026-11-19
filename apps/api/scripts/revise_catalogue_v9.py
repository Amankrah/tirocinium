"""Derive bree-216 catalogue v9 from v8 (decision 0116, catalogue changelog v9).

v9 adds the three materials BREE 216 project groups asked for and the
catalogue did not stock: S-2 glass fabric and a carbon and E-glass hybrid
fabric at Terrafibre, and borosilicate 3.3 sheet at Cascades among the
glazing. Nothing already in v8 changes: the same 146 lines keep their SKUs,
prices, properties, notes and geometry, and the briefs are untouched. Each new
line is written out whole below as data, placed beside the lines a student
would compare it with.

    .venv/bin/python scripts/revise_catalogue_v9.py

Re-running rewrites v9.json identically. Nothing here touches v1 to v8.
"""

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent / "catalogue" / "bree-216"

# The roll rule every Terrafibre fabric already sells by (v8's ROLL).
ROLL_CUT = {
    "min_mm": 100,
    "max_mm": 50_000,
    "increment_mm": 10,
    "kerf_mm": 0,
    "tolerance_mm": 10,
    "fee_cents": 0,
}

GLASS_END_OF_LIFE = (
    "Glass fibre survives the resin but cannot be economically separated from a "
    "thermoset matrix; most GFRP is ground and used as filler or landfilled."
)

S_GLASS: dict[str, Any] = {
    "sku": "TFC-SG-300",
    "supplier": "TFC",
    "category": "Glass reinforcement",
    "name": "S-2 glass fibre 8-harness satin, 300 g/m\u00b2",
    "spec": "1.27 m wide roll",
    "list_price_cents": 3400,
    "unit": "m2",
    "kg_per_unit": 0.3,
    "moq": 2,
    "lead_days": 7,
    "stock": "lo",
    "cut_fee_cents": 0,
    "swatch": "glassf",
    "properties": {
        "rho": 2460,
        "sy": 0,
        "su": 4600,
        "E": 87,
        "hb": "n/a",
        "K": 1.4,
        "a": 1.6,
        "tmax": 650,
        "corr": 4,
        "food": 0,
        "uv": 4,
        "recy": 15,
        "ee": 60,
        "kic": 18,
        "el": 5.4,
        "co2": 3.2,
        "h2o": 70,
        "recovery": 10,
        "tmin": -60,
    },
    "tags": ["high strength", "impact", "aerospace grade"],
    "description": (
        "A magnesium aluminosilicate glass whose fibre is about a third stronger "
        "and a fifth stiffer than E-glass fibre, at roughly four times the price of "
        "E-glass cloth. Like carbon and basalt, this line states the fibre's own "
        "figures, while the E-glass lines state a laminate's, so compare like with "
        "like. Against carbon it buys toughness rather than stiffness: it stretches "
        "5.4 % before breaking where carbon manages 1.5 %, which is why it is chosen "
        "for impact-loaded and pressure-vessel laminates."
    ),
    "fabrication": (
        "Vacuum infusion or prepreg with epoxy; its sizing is made for epoxy and "
        "bonds poorly to polyester. The satin weave drapes over compound curves "
        "without darting."
    ),
    "service": False,
    "volatility": 0.1,
    "oversize": False,
    "end_of_life": GLASS_END_OF_LIFE,
    "geometry": {"form": "roll", "roll_width_mm": 1270.0, "cut": ROLL_CUT},
}

# Half carbon and half E-glass by mass. Density, energy, carbon and water are
# the mass-weighted means of TFC-CF-200 and the E-glass fabrics on this page.
CARBON_GLASS: dict[str, Any] = {
    "sku": "TFC-CGH-200",
    "supplier": "TFC",
    "category": "Glass reinforcement",
    "name": "Carbon-reinforced glass fibre hybrid twill, 200 g/m\u00b2",
    "spec": "1.27 m wide roll",
    "list_price_cents": 2900,
    "unit": "m2",
    "kg_per_unit": 0.2,
    "moq": 2,
    "lead_days": 7,
    "stock": "lo",
    "cut_fee_cents": 0,
    "swatch": "hybridcg",
    "properties": {
        "rho": 2090,
        "sy": 0,
        "su": 3450,
        "E": 150,
        "hb": "n/a",
        "K": 5,
        "a": 2,
        "tmax": 400,
        "corr": 4,
        "food": 0,
        "uv": 4,
        "recy": 5,
        "ee": 164,
        "kic": 18,
        "el": 1.5,
        "co2": 13.8,
        "h2o": 180,
        "recovery": 5,
        "tmin": -60,
    },
    "tags": ["hybrid", "stiffness on a budget", "fail-safe"],
    "description": (
        "Carbon tows woven with E-glass, about half of each by mass. The fibre "
        "modulus is about two thirds of carbon's for a little over half its price, "
        "and the figures here are the two fibres' mass-weighted means, with the "
        "stiffness strongest along the carbon. The point of a hybrid is how it "
        "fails: the carbon breaks first at 1.5 % strain and the glass, which "
        "stretches further, holds the part together, so it cracks rather than "
        "shatters."
    ),
    "fabrication": (
        "Vacuum infusion or hand layup with epoxy. The carbon still makes a severe "
        "galvanic couple with aluminium and steel: isolate it exactly as you would "
        "plain carbon fibre."
    ),
    "service": False,
    "volatility": 0.12,
    "oversize": False,
    "end_of_life": (
        "Pyrolysis can recover chopped fibre, but it comes back as a carbon and "
        "glass mix with no market of its own, so most hybrid laminate is ground "
        "for filler or landfilled. At 13.8 kg CO2/kg it sits halfway between "
        "glass and carbon."
    ),
    "geometry": {"form": "roll", "roll_width_mm": 1270.0, "cut": ROLL_CUT},
}

# Glass is scored and snapped, not sawn: no kerf, and a charge per cut piece
# like every other sheet on this page.
BOROSILICATE: dict[str, Any] = {
    "sku": "CPP-BORO-5",
    "supplier": "CPP",
    "category": "Glazing",
    "name": "Borosilicate 3.3 float glass sheet",
    "spec": "5 mm \u00b7 1000 \u00d7 1200 mm",
    "list_price_cents": 28500,
    "unit": "ea",
    "kg_per_unit": 13.38,
    "moq": 1,
    "lead_days": 7,
    "stock": "lo",
    "cut_fee_cents": 0,
    "swatch": "boro",
    "properties": {
        "rho": 2230,
        "sy": 0,
        "su": 40,
        "E": 64,
        "hb": "480 HK",
        "K": 1.2,
        "a": 3.3,
        "tmax": 450,
        "corr": 5,
        "food": 1,
        "uv": 5,
        "recy": 30,
        "ee": 30,
        "kic": 0.8,
        "el": 0,
        "co2": 2.2,
        "h2o": 20,
        "recovery": 5,
        "tmin": -70,
    },
    "tags": ["thermal shock resistant", "food contact", "chemically inert", "brittle"],
    "description": (
        "The glass of laboratory ware and oven dishes. Its thermal expansion is "
        "3.3 00d7 10\u207b\u2076 per kelvin, about a third of ordinary soda-lime "
        "glass's 9, so it survives a sudden temperature change that would crack "
        "window glass. It is inert to food, cleaning chemicals and UV, and never "
        "yellows or scratches like the clear polymers on this page. The price is "
        "brittleness: its fracture toughness is about a quarter of polycarbonate's, "
        "and it breaks without warning."
    ),
    "fabrication": (
        "Scored and snapped to size, then edges seamed or ground: an unground edge "
        "is where a crack starts. Drill with a diamond core bit under water. It "
        "cannot be thermally toughened the way soda-lime can, so design for its "
        "annealed strength and keep any thermal step under about 100 K."
    ),
    "service": False,
    "volatility": 0.08,
    "oversize": False,
    "end_of_life": (
        "Not accepted in container-glass recycling: it melts at a higher "
        "temperature than soda-lime, and a single piece leaves unmelted stones "
        "through a furnace load. Inert in landfill; offcuts are reused as cut "
        "stock or sent to specialist borosilicate recyclers."
    ),
    "geometry": {
        "form": "sheet",
        "thickness_mm": 5.0,
        "width_mm": 1000.0,
        "length_mm": 1200.0,
        "cut": {
            "min_mm": 50,
            "max_mm": 1200.0,
            "increment_mm": 1,
            "kerf_mm": 0,
            "tolerance_mm": 1,
            "fee_cents": 900,
        },
    },
}

# Each new line goes in after the line a student would compare it with.
INSERT_AFTER: list[tuple[str, dict[str, Any]]] = [
    ("TFC-CF-200", CARBON_GLASS),
    ("TFC-CF-200", S_GLASS),
    ("CPP-PETG-3", BOROSILICATE),
]

ADDED = [S_GLASS["sku"], CARBON_GLASS["sku"], BOROSILICATE["sku"]]


def revise(v8: dict[str, Any]) -> dict[str, Any]:
    v9: dict[str, Any] = json.loads(json.dumps(v8))
    v9["version"] = 9
    v9["course_note"] = v9["course_note"] + (
        " Version 9 adds S-2 glass fabric, a carbon and E-glass hybrid fabric, and "
        "borosilicate glass sheet, which project groups asked for."
    )
    lines: list[dict[str, Any]] = v9["lines"]
    skus = {line["sku"] for line in lines}
    for anchor, new in INSERT_AFTER:
        assert new["sku"] not in skus, f"{new['sku']} is already stocked"
        at = next(i for i, line in enumerate(lines) if line["sku"] == anchor)
        lines.insert(at + 1, json.loads(json.dumps(new)))
        skus.add(new["sku"])
    return v9


def main() -> None:
    v8 = json.loads((ROOT / "v8.json").read_text(encoding="utf-8"))
    v9 = revise(v8)
    (ROOT / "v9.json").write_text(
        json.dumps(v9, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    print(f"wrote {ROOT / 'v9.json'}: {len(v9['lines'])} lines, added {', '.join(ADDED)}")


if __name__ == "__main__":
    main()
