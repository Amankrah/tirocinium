"""Derive bree-216 catalogue v7 from v6 (decision 0113, catalogue changelog v7).

v7 corrects the environmental layer after an audit of v6's figures and notes
against ICE v3, ecoinvent and the LCA literature. Prices, mechanical
properties and briefs are untouched. Everything here is data, so each
correction can be read, argued with and re-run.

    .venv/bin/python scripts/revise_catalogue_v7.py

Re-running rewrites v7.json identically. Nothing here touches v1 to v6.
"""

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent / "catalogue" / "bree-216"

# The Québec grid, as every Macdonald shop hour already implies: about 0.5 g
# CO2e per MJ of electricity. Electric processes whose carbon was a fossil-grid
# figure are brought onto it, plus a stated consumables allowance where one
# exists.
GRID_KG_PER_MJ = 0.0005

# Coating services were priced and sold per square metre while their energy
# and carbon were stated per square decimetre, so a coated area under-counted
# a hundredfold. The figures move to the unit of sale; the per-dm² values are
# recomputed where the audit found them inconsistent with an electric process.
# (energy MJ per dm², carbon kg per dm², note)
COATINGS_PER_DM2: dict[str, tuple[float, float, str]] = {
    "VHM-TIN-COAT": (
        9.0,
        0.015,
        "Per m² of coated surface; the per-dm² figures are a hundredth of these. "
        "Vacuum PVD on the Québec grid, plus the titanium target and process gases, "
        "which are most of the carbon. The coating triples tool life, so it usually "
        "pays back many times in avoided tool manufacture.",
    ),
    "VHM-WCCO-HVOF": (
        46.0,
        3.1,
        "Per m² of coated surface; the per-dm² figures are a hundredth of these. "
        "Oxy-fuel combustion plus carbide powder, roughly half of which is lost as "
        "overspray; the powder, not the flame, is most of the carbon.",
    ),
    "VHM-DLC-COAT": (
        14.0,
        0.017,
        "Per m² of coated surface; the per-dm² figures are a hundredth of these. "
        "Low-temperature PVD on the Québec grid, plus process gases and target.",
    ),
    "VHM-CR-PLATE": (
        11.0,
        0.025,
        "Per m² of coated surface; the per-dm² figures are a hundredth of these. "
        "Electroplating on the Québec grid, plus the chromic acid consumed. Hexavalent "
        "chromium plating carries significant effluent treatment and a tightening "
        "regulatory outlook.",
    ),
    "MFW-ELECTROPOL": (
        0.3,
        0.005,
        "Per m² of surface; the per-dm² figures are a hundredth of these. An electric "
        "process on the Québec grid, a few minutes at 20 A per dm². The spent "
        "electrolyte is metal-bearing hazardous waste: the highest-impact step in a "
        "sanitary fabrication is its effluent, not its energy.",
    ),
}

# Electric processes whose carbon sat above the grid ratio with no stated
# non-electric contributor. (energy MJ per unit unchanged, carbon per unit)
PROCESS_CARBON: dict[str, float] = {
    "MFW-PLASMA-M": round(4.0 * GRID_KG_PER_MJ, 4),
    "MFW-NDT-UT": round(8.0 * GRID_KG_PER_MJ, 4),
    # Citric acid and rinse water are the consumables; a small allowance per kg.
    "MFW-PASSIVATE": round(1.2 * GRID_KG_PER_MJ + 0.02, 4),
}

# Processes whose carbon counted consumables while their energy did not.
PROCESS_ENERGY: dict[str, float] = {
    # 3.2 MJ of cycle energy plus about 50 g of commodity polymer at 80 MJ/kg,
    # which the fabrication note says the figure includes.
    "MFW-INJMOLD-P": 7.2,
    # 12 MJ of pump and heat plus the embodied energy of about a kilogram of
    # single-use bagging consumables.
    "MFW-VACINF-HR": 90.0,
}

PROCESS_NOTES: dict[str, str] = {
    "MFW-HT-CASE": (
        "Per kg. Long furnace cycles at 900 °C make carburising one of the two most "
        "energy-intensive heat treatments here, second only to nitriding."
    ),
    "MFW-INJMOLD-P": (
        "Per part, including about 50 g of commodity polymer at 80 MJ/kg. Cycle "
        "energy is small; the material is most of the figure, so a lighter part is "
        "the lever."
    ),
    "MFW-VACINF-HR": (
        "Per hour, dominated by single-use consumables: bagging film, peel ply, flow "
        "media and tubing, all landfilled after one cure. Their embodied energy is "
        "counted here as well as their carbon."
    ),
}

# Galvanising adds about 0.2 kg CO2e per kg over plain A36 (2.1), as the lines'
# own notes and the galvanising service say; v6 carried 2.5.
GALVANISED_CO2 = 2.3
GALVANISED = ("LMS-GALV-SH10", "LMS-HSS-5032", "LMS-HSS-5048", "LMS-HSS-7648", "LMS-PIPE-S40-50")

# Biogenic storage is credited uniformly: fossil cradle-to-gate carbon minus
# the carbon held in the supplied dry plant fibre, at 1.6 kg CO2 per kg of
# fibre (cellulose and lignin at about 44 % carbon), for as long as the fibre
# stays in the part. Balsa, straw board and hempcrete already carried the
# credit; the fibre reinforcements did not, which made a bio-core against a
# bio-skin comparison meaningless. Bio-epoxy is not credited: its bio-carbon
# content is not stated on the line.
BIOGENIC_NET_CO2: dict[str, float] = {
    "TFC-FLAX-300": -1.0,
    "TFC-HEMP-400": -1.15,
    "TFC-JUTE-350": -1.25,
}

# Figures the audit found outside the accepted range or the stored method.
PROPERTIES: dict[str, dict[str, Any]] = {
    # Realistic collection of cemented carbide is about half (ITIA); 95 % is the
    # yield of the zinc-reclaim process on what is collected.
    "VHM-WC10-BLK": {"recovery": 50},
    "VHM-WC6-INS": {"recovery": 50},
    "VHM-WC10-ROD": {"recovery": 50},
    # A core bonded between skins, and an MDI-bonded board, go to landfill or
    # energy recovery with their host. Kiln-dried shipped timber and
    # particleboard carry about 10 and 14 MJ/kg (ICE).
    "TFC-BALSA-12": {"recovery": 15, "ee": 10},
    "TFC-STRAW-18": {"recovery": 20, "ee": 14},
    # A block that is a quarter to a third hemp by mass, under the same water
    # method as the hemp fabric.
    "TFC-HEMPBLK": {"h2o": 700},
    # PETG contaminates the PET bottle stream (APR) and is rarely recycled.
    "CPP-PETG-3": {"recy": 25, "recovery": 15},
    # PTFE scrap is reground into reprocessed grades and depolymerised
    # commercially; small, but not zero.
    "CPP-PTFE-3": {"recy": 15, "recovery": 5},
    # Stellite 6: literature spans 10 to 25 kg CO2e/kg on cobalt sourcing.
    "VHM-STEL-6": {"co2": 20},
}

# Lowest useful service temperature, made consistent across the table. Grey
# iron has no transition and serves at -40; FCC aluminium alloys and
# austenitic stainless fasteners are cryogenic-capable; CP titanium grade 2 is
# limited to about -196 (ELI grades go lower); galvanising does not improve
# the Charpy of A500 tube; the three inorganic fibres are matrix-limited and
# must agree; nylon and EPDM parts take their polymer's limit. Vulcan's
# materials had no figure at all: tool steels take -20 (hardened, notch
# sensitive), carbide, ceramics and cobalt alloy -40 (brittle at every
# temperature, so the figure is a thermal-shock limit rather than a ductility
# transition), hardfacing and the bimetal blade their steel body's -20.
TMIN: dict[str, int] = {
    "LMS-CI-G30": -40,
    "LMS-6061-PL06": -196,
    "LMS-6061-BAR": -196,
    "LMS-6061-TUBE": -196,
    "LMS-6063-ANG": -196,
    "LMS-5052-SH": -196,
    "LMS-7075-PL": -196,
    "BSA-TI-GR2": -196,
    "LMS-HSS-5032": -20,
    "LMS-HSS-5048": -20,
    "LMS-HSS-7648": -20,
    "LMS-PIPE-S40-50": -20,
    "LMS-GALV-SH10": -20,
    "TFC-CF-200": -60,
    "TFC-BAS-300": -60,
    "BSA-CLAMP-38": -196,
    "BSA-BOLT-M10": -196,
    "BSA-NUT-M10": -40,
    "BSA-GASK-38": -50,
    "VHM-M2-HSS": -20,
    "VHM-D2-PL": -20,
    "VHM-A2-PL": -20,
    "VHM-O1-FG": -20,
    "VHM-S7-PL": -20,
    "VHM-H13-PL": -20,
    "VHM-WC10-BLK": -40,
    "VHM-WC6-INS": -40,
    "VHM-WC10-ROD": -40,
    "VHM-STEL-6": -40,
    "VHM-WCROD-HF": -20,
    "VHM-AL2O3-PL": -40,
    "VHM-SIC-TILE": -40,
    "VHM-ZRO2-ROD": -40,
    "VHM-SI3N4-BALL": -40,
    "VHM-BIMET-34": -20,
}

END_OF_LIFE: dict[str, str] = {
    "VHM-WC10-BLK": (
        "Carbide scrap is worth more per kilogram than most finished steels, and "
        "zinc-reclaim recycling recovers over 95 % of what is collected; realistic "
        "collection is about half, because tips and inserts are small and scattered. "
        "High production carbon, and a loop that closes only where scrap is gathered."
    ),
    "TFC-BALSA-12": (
        "Carbon-negative while the stored biogenic carbon remains locked in the panel, "
        "but a core bonded between skins is landfilled or burned with them, so the "
        "credit lasts exactly as long as the panel. Rots if water reaches it, so the "
        "seal detail decides whether that carbon stays stored."
    ),
    "TFC-STRAW-18": (
        "Diverts wheat straw from field burning and stores its carbon for the "
        "building's life. MDI-bonded board is not separated at end of life: expect "
        "energy recovery or landfill, not a return to board. The formaldehyde-free "
        "binder keeps indoor air quality within code."
    ),
    "TFC-FLAX-300": (
        "Carbon-negative as supplied: the fibre holds the carbon it took up while "
        "growing, credited here as it is for balsa and hempcrete, and keeps it only "
        "while the laminate is in service. Compostable or energy recovery at end of "
        "life, which releases it. Note the water figure: natural fibres trade low "
        "energy for high agricultural water use."
    ),
    "TFC-HEMP-400": (
        "Carbon-negative as supplied on the same biogenic credit as flax. Hemp needs "
        "no irrigation in most Canadian growing regions, so the water figure is "
        "largely green (rainfall) rather than blue (abstracted) water. State which "
        "you mean in your report."
    ),
    "TFC-JUTE-350": (
        "Carbon-negative as supplied on the same biogenic credit as flax, with the "
        "lowest embodied energy of any reinforcement in this catalogue, and fully "
        "compostable. Imported, so add transport to your boundary."
    ),
    "BSA-FILL-316L": (
        "Weld metal is recycled with the stainless scrap it joins; stub ends and "
        "spatter are swept into the same stream. A welded joint cannot be "
        "disassembled, which is the recycling argument for fasteners instead."
    ),
    "CPP-PETG-3": (
        "Marked PET but a contaminant of the PET bottle stream: its lower melting "
        "point hazes recycled PET, so recyclers reject it and most of it is "
        "landfilled or burned. Food-contact approved for re-use."
    ),
    "TFC-CF-200": (
        "Pyrolysis recovers chopped fibres that keep most of their strength but not "
        "their length or alignment, so a laminate made from them reaches a fraction "
        "of the virgin laminate's stiffness. At 25 kg CO2/kg, carbon fibre must earn "
        "its place through mass saving in the use phase."
    ),
    "CPP-PTFE-3": (
        "Rarely recycled: clean scrap is reground into reprocessed grades and some is "
        "depolymerised, but incineration generates persistent fluorinated compounds. "
        "Fluoropolymers are under active regulatory pressure, a genuine supply risk "
        "for a 20-year design."
    ),
    "CPP-GEOM-15": (
        "Mechanically recyclable if clean and separated, but a liner under a lagoon "
        "or a basin is almost never lifted: assume it stays in place when you build "
        "the life-cycle case."
    ),
    "LMS-6061-PL06": (
        "Re-melting takes about 5 % of primary energy, but alloy families must be "
        "kept separate: mixed extrusion and sheet scrap downgrades to cast alloy and "
        "never returns to structural use. The carbon figure is a world-average "
        "primary; Québec hydro smelters are nearer 5 kg CO2e/kg, and recycled "
        "content lower still, so state the source in your report."
    ),
}

DESCRIPTIONS: dict[str, str] = {
    "CPP-PETG-3": (
        "The easiest of the clear polymers to thermoform, and food-contact approved, "
        "as are grades of polycarbonate and acrylic on this page. Poor UV resistance "
        "without a co-extruded cap, and not accepted by the PET recycling stream "
        "despite the name."
    ),
    "TFC-BAS-300": (
        "Spun from melted volcanic rock with no additives. Stiffer and far more heat- "
        "and alkali-resistant than E-glass, with about a fourteenth of the embodied "
        "energy of carbon fibre. A credible middle ground where glass is too flexible "
        "and carbon too expensive."
    ),
}

COURSE_NOTE_ADDITION = (
    " Version 7 states the method the figures follow: carbon is net cradle-to-gate, "
    "fossil emissions minus biogenic carbon stored in the supplied material, credited "
    "uniformly to every plant-based line at 1.6 kg CO2 per kg of dry fibre; water is "
    "an inventory figure in litres, not a scarcity-weighted footprint; a process "
    "states energy and carbon per unit of sale and carries no water figure because "
    "the source table has none."
)


def revise(v6: dict[str, Any]) -> dict[str, Any]:
    v7: dict[str, Any] = json.loads(json.dumps(v6))
    v7["version"] = 7
    v7["course_note"] = v7["course_note"] + COURSE_NOTE_ADDITION
    by_sku = {line["sku"]: line for line in v7["lines"]}

    for sku, (energy_dm2, carbon_dm2, note) in COATINGS_PER_DM2.items():
        line = by_sku[sku]
        assert line["unit"] == "m2", sku
        line["process_energy_mj"] = round(energy_dm2 * 100, 3)
        line["process_carbon_kg"] = round(carbon_dm2 * 100, 3)
        line["process_note"] = note
    for sku, carbon in PROCESS_CARBON.items():
        by_sku[sku]["process_carbon_kg"] = carbon
    for sku, energy in PROCESS_ENERGY.items():
        by_sku[sku]["process_energy_mj"] = energy
    for sku, note in PROCESS_NOTES.items():
        by_sku[sku]["process_note"] = note
    for sku in GALVANISED:
        by_sku[sku]["properties"]["co2"] = GALVANISED_CO2
    for sku, co2 in BIOGENIC_NET_CO2.items():
        by_sku[sku]["properties"]["co2"] = co2
    for sku, props in PROPERTIES.items():
        by_sku[sku]["properties"].update(props)
    for sku, tmin in TMIN.items():
        by_sku[sku]["properties"]["tmin"] = tmin
    for sku, text in END_OF_LIFE.items():
        by_sku[sku]["end_of_life"] = text
    for sku, text in DESCRIPTIONS.items():
        by_sku[sku]["description"] = text

    # A line whose description or note compares itself to another must still be
    # right after the figures move.
    assert by_sku["TFC-HEMPBLK"]["properties"]["ee"] <= min(
        line["properties"]["ee"] for line in v7["lines"] if line["properties"].get("ee")
    ), "hempcrete no longer has the lowest embodied energy"
    for line in v7["lines"]:
        text = line.get("end_of_life", "") + line["description"] + line.get("process_note", "")
        assert "—" not in text, line["sku"]
    return v7


def main() -> None:
    v6 = json.loads((ROOT / "v6.json").read_text(encoding="utf-8"))
    v7 = revise(v6)
    (ROOT / "v7.json").write_text(
        json.dumps(v7, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    changed = sum(1 for a, b in zip(v6["lines"], v7["lines"], strict=True) if a != b)
    print(f"wrote {ROOT / 'v7.json'}: {changed} of {len(v7['lines'])} lines changed")


if __name__ == "__main__":
    main()
