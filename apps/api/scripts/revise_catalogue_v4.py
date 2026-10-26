"""Derive bree-216 catalogue v4 from v3 (decision 0112, catalogue changelog v4).

v4 changes nothing about any line. It gives each of the seventeen briefs the
requirements statement a professor's project challenge actually carries: the
context the part lives in, what it must do with a target where one can be
stated, the constraints, the deliverable, and a suggested weighting over the
matrix criteria. The families in contention and the shortlist stay in the
asset and become the reveal a student earns by committing a selection.

These statements are drafts written by the platform's engineer from the
briefs' own titles and factors, for the course author to review. They are
labelled as such in the changelog, and the course author's review replaces
them as a later revision rather than editing this file.

    .venv/bin/python scripts/revise_catalogue_v4.py

Re-running rewrites v4.json identically. Nothing here touches v1 to v3.
"""

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent / "catalogue" / "bree-216"

DELIVERABLE = (
    "A justified selection: the candidates you weighed, the weighting you argued "
    "from and why, the scored matrix, and a quotation for the line you chose at "
    "the quantity the project needs. The report is marked on the justification, "
    "not on the pick."
)


def req(text: str, target: str = "") -> dict[str, str]:
    return {"text": text, "target": target}


BRIEFS: dict[str, dict[str, Any]] = {
    "brief-01": {
        "context": (
            "A mouldboard plough for a 120 hp tractor working stony clay loam in the "
            "Montérégie. The share is the wearing edge: it cuts the furrow, carries "
            "the soil load onto the mouldboard, and hits the occasional rock at "
            "field speed. Shares are consumables and the farm replaces a set every "
            "season or two."
        ),
        "requirements": [
            req(
                "Resist abrasive wear from soil and grit over a full season",
                "300 to 500 ha before replacement",
            ),
            req(
                "Survive rock impacts at working speed without fracturing",
                "impact toughness at 0 to 30 °C",
            ),
            req("Hold a cutting edge, or be sharpenable in the farm workshop"),
            req("Be replaceable by the farmer with hand tools", "bolt-on share"),
            req("Keep the cost per hectare worked below the cost of the fuel a sharp edge saves"),
        ],
        "constraints": [
            "Batch of 200 shares a year for the dealer network",
            "Must be weldable or brazeable for hardfacing or tip repair",
            "No coating that cannot survive soil abrasion",
        ],
        "weights": {"cost": 4, "toughness": 5, "strength": 3, "lead": 2, "embodied_energy": 1},
    },
    "brief-02": {
        "context": (
            "A ring die and roller shells for a 5 t/h biomass pellet mill compressing "
            "wood and straw at 90 to 110 °C. The die's channels see sliding abrasion "
            "from silica in the feed and cyclic pressure every revolution; a die is "
            "scrapped when the channels wear open and pellet density falls."
        ),
        "requirements": [
            req("Resist abrasive wear in the die channels", "2 000 h minimum service"),
            req(
                "Keep channel dimensions stable through thermal cycling",
                "90 to 110 °C continuous",
            ),
            req(
                "Survive cyclic compressive loading without fatigue cracking",
                "10^8 cycles",
            ),
            req("Be machinable or formable into a drilled ring with thousands of channels"),
            req("Be re-manufacturable or re-coatable at end of life"),
        ],
        "constraints": [
            "Replacement every 2 000 h is a known operating cost; a longer life must earn it",
            "Food contact is not required, but no heavy-metal coating that could reach the feed",
            "One die per mill, four mills on the site",
        ],
        "weights": {"cost": 3, "toughness": 3, "temperature": 4, "strength": 3, "lead": 2},
    },
    "brief-03": {
        "context": (
            "The structural frame of a 9 m by 30 m commercial greenhouse near "
            "Saint-Hyacinthe: columns, trusses and purlins carrying the glazing, "
            "snow and wind, in a humid interior that is warm in summer and above "
            "freezing all winter while the outside is at minus 30 °C."
        ),
        "requirements": [
            req(
                "Carry the roof snow load with the required safety factor",
                "2.4 kPa ground snow, NBC",
            ),
            req("Resist wind uplift and racking", "0.45 kPa reference wind"),
            req(
                "Survive the humid interior without corrosion for the design life",
                "25 years",
            ),
            req("Limit thermal expansion so glazing seals stay tight", "60 °C annual swing"),
            req("Be assembled on site by a small crew with bolted connections"),
        ],
        "constraints": [
            "Frame mass is set by what the foundations and the crew can handle",
            "Members are standard mill lengths; splices cost labour",
            "Total frame budget per square metre of floor is fixed by the business plan",
        ],
        "weights": {"cost": 4, "stiffness": 4, "corrosion": 4, "carbon": 2, "lead": 2},
    },
    "brief-04": {
        "context": (
            "The knives of a 150 mm disc chipper fed with green hardwood and the "
            "odd nail or stone from the landing. Each knife is struck thousands of "
            "times an hour and is removed, ground and refitted on a schedule."
        ),
        "requirements": [
            req(
                "Take repeated impact at the edge without chipping or cracking",
                "impact toughness",
            ),
            req("Hold an edge between regrinds", "8 h of chipping"),
            req("Survive a stray nail or stone with a dent rather than a fracture"),
            req("Be resharpened on a surface grinder in the shop"),
            req("Resist fatigue at the mounting bolts"),
        ],
        "constraints": [
            "Knife set of four, replaced as a set, with a spare set in the truck",
            "Heat treatment is done by a contractor and adds lead time",
            "Edge geometry is fixed by the chipper maker",
        ],
        "weights": {"toughness": 5, "strength": 3, "cost": 3, "lead": 3},
    },
    "brief-05": {
        "context": (
            "A buried mainline and surface laterals for a 40 ha drip-irrigated "
            "vegetable farm. The mainline runs 600 m from a pond pump at 6 bar; the "
            "laterals lie on the surface all season and are rolled up for winter."
        ),
        "requirements": [
            req("Hold the pump pressure with a margin for surges", "6 bar working, 1.5x surge"),
            req("Survive summer sun on the surface laterals", "UV exposure, 20-year life"),
            req("Resist fertigation chemicals and chlorinated water"),
            req(
                "Survive soil loading, frost heave and ground movement when buried",
                "1.2 m cover",
            ),
            req("Be joined in the field with hand tools or with tooling the farm can rent"),
        ],
        "constraints": [
            "600 m of mainline and 4 000 m of lateral; the quantity dominates",
            "Food crop: no leaching of plasticisers or metals into the water",
            "Installation window is two weeks in spring",
        ],
        "weights": {"cost": 5, "uv": 4, "corrosion": 3, "lead": 3, "recyclability": 2},
    },
    "brief-06": {
        "context": (
            "The core of a sandwich panel for a demountable agricultural building: "
            "a bio-based core between thin skins, carrying wall loads, resisting "
            "the damp of a barn interior, and arguing its case on embodied energy "
            "against mineral wool and polystyrene."
        ),
        "requirements": [
            req(
                "Carry the panel's shear and compressive load as a core",
                "wall panel, 3 m height",
            ),
            req("Resist moisture uptake in a barn interior", "no swelling at 80 % RH"),
            req("Hold its properties through summer and winter", "minus 30 to 40 °C"),
            req("Meet the fire performance the building code asks of an agricultural wall"),
            req("Deliver a lower embodied energy than the mineral and petrochemical cores"),
        ],
        "constraints": [
            "Panel skins and adhesives are already chosen",
            "The core must be sourced within the province to make the sustainability case",
            "Pilot run of 60 panels",
        ],
        "weights": {"embodied_energy": 5, "carbon": 4, "stiffness": 3, "cost": 3, "corrosion": 2},
    },
    "brief-07": {
        "context": (
            "The hopper of a tractor-mounted fertiliser spreader, 1 200 L, carrying "
            "granular urea, ammonium nitrate and potash through a wet spring, washed "
            "down at the end of each day and parked outside between seasons."
        ),
        "requirements": [
            req("Resist corrosion by hygroscopic fertiliser salts and their wet residue"),
            req(
                "Carry 1.2 t of granules with the spreader bouncing over fields",
                "structural at 2 g",
            ),
            req(
                "Keep a smooth interior so granules flow and do not bridge",
                "surface finish",
            ),
            req("Survive sun and frost parked outside", "UV and minus 30 °C"),
            req("Be repairable on the farm after impact damage"),
        ],
        "constraints": [
            "Hopper geometry is the maker's; wall thickness is yours",
            "Production run of 500 a year",
            "Fasteners and the frame below are galvanised steel",
        ],
        "weights": {"corrosion": 5, "cost": 4, "strength": 3, "uv": 3, "toughness": 2},
    },
    "brief-08": {
        "context": (
            "The milk-contact parts of a rotary parlour: claws, lines and the "
            "receiving jar, cleaned in place twice a day with alkaline and acid "
            "detergents at up to 75 °C, and inspected under a sanitary standard."
        ),
        "requirements": [
            req(
                "Be approved for food contact and cleanable to a sanitary standard",
                "3-A, Ra 0.8 µm",
            ),
            req(
                "Resist chloride-bearing CIP detergents and acid rinses at temperature",
                "75 °C, twice daily",
            ),
            req("Resist bacterial adhesion on the product surface"),
            req("Survive thermal shock from hot CIP to cold milk, year after year"),
            req("Be welded and polished to a sanitary finish by a certified fabricator"),
        ],
        "constraints": [
            "Every weld is orbital and documented; fabrication cost is part of the selection",
            "Spares must be available within days",
            "Parts in contact with each other must not couple galvanically",
        ],
        "weights": {"corrosion": 5, "cost": 3, "temperature": 2, "lead": 3, "recyclability": 2},
    },
    "brief-09": {
        "context": (
            "Rails, clamps and brackets for a 50 kW ground-mounted solar array at "
            "the edge of a field: outdoors for thirty years, bonded for electrical "
            "grounding, expanding and contracting every day of the year."
        ),
        "requirements": [
            req("Resist atmospheric corrosion unpainted for the array's life", "30 years outdoors"),
            req("Carry the panel wind and snow loads", "0.45 kPa wind, 2.4 kPa snow"),
            req(
                "Limit thermal expansion over the rail length so modules stay seated",
                "minus 35 to 60 °C",
            ),
            req("Provide an electrical grounding path through the structure"),
            req("Be assembled with hand tools by a two-person crew"),
        ],
        "constraints": [
            "Dissimilar metals in contact must be isolated",
            "Rails are 6 m lengths; the quantity is 180 m of rail and 400 clamps",
            "Nothing that needs painting or maintenance in the field",
        ],
        "weights": {"corrosion": 5, "cost": 4, "stiffness": 3, "carbon": 2, "lead": 2},
    },
    "brief-10": {
        "context": (
            "A 400 m³ anaerobic digester for dairy manure, buried to its shoulders, "
            "holding slurry at 38 °C with hydrogen sulphide in the headspace and "
            "biogas that must not leak."
        ),
        "requirements": [
            req("Resist manure slurry, organic acids and H2S for the design life", "20 years"),
            req("Be gas-tight against methane at low pressure", "20 mbar headspace"),
            req("Carry the hydrostatic load of a full tank and the soil load outside it"),
            req("Hold 38 °C with insulation, through a Québec winter"),
            req("Be built or delivered to a farm site with a crane and a local crew"),
        ],
        "constraints": [
            "A leak is a safety event, not a maintenance item",
            "One tank; this is a one-off, so tooling cannot be amortised",
            "Repairs must be possible without emptying the tank for weeks",
        ],
        "weights": {"corrosion": 5, "strength": 3, "cost": 3, "lead": 2, "carbon": 2},
    },
    "brief-11": {
        "context": (
            "The wall panels, stiffeners and roof of a 300 t grain bin on a farm "
            "near Trois-Rivières: full of grain at 15 % moisture in autumn, empty and "
            "sweating condensation in spring, and standing in the wind for forty "
            "years."
        ),
        "requirements": [
            req("Carry the grain pressure and the wind load on the wall", "300 t, ring stiffeners"),
            req(
                "Resist corrosion from condensation and grain dust inside, weather outside",
                "40-year life",
            ),
            req("Survive daily thermal cycling without loosening bolted seams"),
            req("Keep the wall a moisture barrier to the stored grain"),
            req("Be shipped flat and bolted up on site"),
        ],
        "constraints": [
            "Wall sheets are corrugated from coil; forming limits the alloy",
            "Hundreds of square metres: the price per square metre decides it",
            "Grain is a food: no coating that flakes into it",
        ],
        "weights": {"cost": 5, "corrosion": 4, "strength": 3, "recyclability": 2, "lead": 2},
    },
    "brief-12": {
        "context": (
            "A 1.5 m circular saw blade body for a sawmill breaking down frozen "
            "softwood logs in winter, running hot at the rim, dressed every shift, "
            "and expected to last years."
        ),
        "requirements": [
            req("Hold a cutting edge through a shift in frozen wood", "edge retention"),
            req("Resist rim heating without losing hardness or tension", "rim at 150 °C"),
            req("Survive the shock of frozen knots and ice without cracking the body"),
            req("Resist fatigue over millions of tooth impacts"),
            req("Be tensioned, hammered and re-tipped by the mill's saw filer"),
        ],
        "constraints": [
            "The body and the teeth may be different materials; price both",
            "A blade failure at speed is a safety event",
            "Six blades in rotation through the filing room",
        ],
        "weights": {"toughness": 5, "temperature": 4, "strength": 3, "cost": 3},
    },
    "brief-13": {
        "context": (
            "The glazing of a greenhouse growing year-round near Québec City, "
            "balancing heating cost against light to the crop, with snow, hail "
            "and minus 35 °C nights outside and a humid interior."
        ),
        "requirements": [
            req("Insulate well enough to make winter heating affordable", "U-value, W/m²·K"),
            req("Transmit as much photosynthetically active light as possible", "PAR"),
            req("Survive hail and snow load without cracking", "25 mm hail"),
            req("Keep its optical properties under UV for the warranty period", "10 years"),
            req("Be fixed to the frame with standard profiles and seals"),
        ],
        "constraints": [
            "Light and insulation pull in opposite directions; the weighting is the decision",
            "1 200 m² of glazing: the price per square metre matters",
            "Replacement panels must be available for storm repairs",
        ],
        "weights": {"cost": 4, "uv": 4, "toughness": 3, "temperature": 2, "lead": 2},
    },
    "brief-14": {
        "context": (
            "The blades and tower of a 10 kW wind turbine for the Macdonald campus "
            "farm: fatigue loading from every gust, ice in winter, rain erosion on "
            "the leading edge, and a thirty-year life in sight of the public."
        ),
        "requirements": [
            req("Resist fatigue over the turbine's life", "10^8 load cycles"),
            req("Stay tough at the winter temperatures the site sees", "minus 35 °C"),
            req("Carry the blade loads with the least mass at the tip", "specific stiffness"),
            req("Resist leading-edge erosion from rain and ice"),
            req("Be repaired on a tower by a rope-access crew"),
        ],
        "constraints": [
            "Blade mass drives the hub, bearing and tower cost; weigh it",
            "A public site: the appearance and the embodied energy will be asked about",
            "Three blades, one tower, one turbine",
        ],
        "weights": {
            "stiffness": 5,
            "toughness": 4,
            "cost": 2,
            "embodied_energy": 3,
            "corrosion": 2,
        },
    },
    "brief-15": {
        "context": (
            "The wheel centres of a tractor sold into the Prairies and northern "
            "Québec: shock loads from frozen ruts at minus 40 °C, road salt in "
            "spring, and a warranty the dealer has to honour."
        ),
        "requirements": [
            req("Stay tough at the lowest temperature the tractor works in", "minus 40 °C"),
            req("Resist fatigue from a lifetime of wheel loads", "10^7 cycles at rated load"),
            req("Resist road salt and manure corrosion with a simple paint system"),
            req("Resist wear at the stud holes and the rim seat"),
            req("Be cast, forged or fabricated in volume at a competitive unit cost"),
        ],
        "constraints": [
            "Production of 5 000 wheels a year: tooling can be amortised",
            "The wheel is safety-critical; a fracture is a recall",
            "Rim and centre may differ; the centre is the question",
        ],
        "weights": {"toughness": 5, "cost": 4, "strength": 3, "corrosion": 3, "recyclability": 1},
    },
    "brief-16": {
        "context": (
            "The plates of a plate heat exchanger pasteurising milk: 4 °C in, 72 °C "
            "out, cleaned in place with chlorinated alkali and nitric acid, and "
            "pressed from thin sheet into a corrugated pattern."
        ),
        "requirements": [
            req(
                "Conduct heat well enough to keep the plate count and pressure drop down",
                "thermal conductivity",
            ),
            req("Be approved for food contact and cleanable to a sanitary standard", "3-A"),
            req(
                "Resist chloride stress corrosion and acid CIP at temperature",
                "72 °C, daily CIP",
            ),
            req("Survive thermal shock between product and CIP cycles"),
            req("Be pressed from 0.5 mm sheet into a deep corrugation without cracking"),
        ],
        "constraints": [
            "200 plates per exchanger; the price per square metre of sheet is the cost",
            "A pinhole contaminates product; corrosion allowance is nil",
            "Gaskets limit the service temperature as much as the metal does",
        ],
        "weights": {"corrosion": 5, "cost": 3, "strength": 2, "temperature": 2, "recyclability": 2},
    },
    "brief-17": {
        "context": (
            "The growing channels of a hydroponic lettuce greenhouse: 12 m "
            "troughs carrying nutrient solution at 20 °C, exposed to the lamps and "
            "the sun, emptied and scrubbed between crops, and in contact with food "
            "for its whole life."
        ),
        "requirements": [
            req("Be approved for contact with a food crop's root zone and solution", "no leaching"),
            req("Exclude light from the solution to stop algae", "opaque"),
            req(
                "Resist nutrient salts, chelates and sanitisers",
                "pH 5.5 to 6.5, peroxide cleaning",
            ),
            req("Survive UV from lamps and sun for the channel's life", "10 years"),
            req("Be cleaned by hand between crops without scratching into a biofilm"),
        ],
        "constraints": [
            "480 m of channel; the price per metre decides it",
            "Channels sit on a steel bench; expansion must not buckle them",
            "The crop is eaten raw: no doubt about food safety is acceptable",
        ],
        "weights": {"cost": 4, "uv": 4, "corrosion": 4, "recyclability": 2, "stiffness": 1},
    },
}


def revise(v3: dict[str, Any]) -> dict[str, Any]:
    v4: dict[str, Any] = json.loads(json.dumps(v3))
    v4["version"] = 4
    seen: set[str] = set()
    for brief in v4["briefs"]:
        content = BRIEFS[brief["id"]]
        seen.add(brief["id"])
        brief["context"] = content["context"]
        brief["requirements"] = content["requirements"]
        brief["constraints"] = content["constraints"]
        brief["deliverable"] = DELIVERABLE
        brief["weights"] = content["weights"]
    assert seen == set(BRIEFS), set(BRIEFS) ^ seen
    return v4


def main() -> None:
    v3 = json.loads((ROOT / "v3.json").read_text(encoding="utf-8"))
    v4 = revise(v3)
    (ROOT / "v4.json").write_text(
        json.dumps(v4, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    assert v4["lines"] == v3["lines"]
    print(f"wrote {ROOT / 'v4.json'}: {len(v4['briefs'])} briefs given requirements")


if __name__ == "__main__":
    main()
