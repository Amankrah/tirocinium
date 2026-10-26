"""Catalogue v7 (decision 0113): the environmental layer after its audit.

What these hold to account. A coating service states its energy and carbon in
the unit it is sold by, so a coated area is no longer a hundredfold under-
counted. Every electric process sits on one grid ratio or states what else it
burns. Biogenic storage is credited to every plant-fibre line or to none, so
a bio-core against a bio-skin is a fair comparison. The claims a note makes
about other lines hold against the figures. And the revision reproduces from
its script byte for byte, like every revision before it.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

from app.marketplace.catalogue import CATALOGUE_ROOT, load_catalogue

V6 = load_catalogue("bree-216", 6)
V7 = load_catalogue("bree-216", 7)

COATINGS = ("VHM-TIN-COAT", "VHM-WCCO-HVOF", "VHM-DLC-COAT", "VHM-CR-PLATE", "MFW-ELECTROPOL")
PLANT_FIBRES = (
    "TFC-FLAX-300",
    "TFC-HEMP-400",
    "TFC-JUTE-350",
    "TFC-BALSA-12",
    "TFC-STRAW-18",
    "TFC-HEMPBLK",
)
GRID_KG_PER_MJ = 0.0005
# What a note names when a process burns or consumes something beyond grid
# electricity: a gas, an acid, a powder, a target, tooling steel, an abrasive.
CONSUMABLE_WORDS = (
    "powder",
    "consumable",
    "gas",
    "argon",
    "shielding",
    "purge",
    "acid",
    "electrolyte",
    "target",
    "polymer",
    "oven",
    "oxy",
    "ammonia",
    "kiln",
    "cure",
    "garnet",
    "abrasive",
    "solvent",
    "penetrant",
    "flame",
    "furnace",
    "tooling",
    "die",
)


def test_nothing_but_the_environmental_layer_moved() -> None:
    for before, after in zip(V6.lines, V7.lines, strict=True):
        assert before.sku == after.sku
        assert before.list_price_cents == after.list_price_cents
        assert before.properties.yield_strength_mpa == after.properties.yield_strength_mpa
        assert before.properties.density_kg_m3 == after.properties.density_kg_m3
    assert [b.id for b in V6.briefs] == [b.id for b in V7.briefs]
    assert V7.briefs[0].requirements == V6.briefs[0].requirements


def test_a_coating_states_its_footprint_per_unit_of_sale() -> None:
    for sku in COATINGS:
        line = V7.line(sku)
        assert line is not None and line.unit == "m2"
        assert line.process_energy_mj is not None and line.process_carbon_kg is not None
        assert "Per m²" in (line.process_note or "")
        # The HVOF figures were right per dm² and simply mis-united; a square
        # metre is a hundred of them.
        if sku == "VHM-WCCO-HVOF":
            old = V6.line(sku)
            assert old is not None and old.process_energy_mj is not None
            assert line.process_energy_mj == old.process_energy_mj * 100


def test_electric_processes_sit_on_the_quebec_grid_or_say_what_else_they_burn() -> None:
    # Gas-fired furnaces, cure ovens and the oxy-fuel spray sit near natural
    # gas's 0.056 kg/MJ; everything else above the grid must name what it burns
    # or consumes.
    gas_fired = {
        "MFW-HT-QT",
        "MFW-HT-CASE",
        "MFW-HT-NITRIDE",
        "MFW-HT-ANNEAL",
        "MFW-GALV-HD",
        "MFW-POWDER-C",
        "MFW-EPOXY-C",
        "VHM-WCCO-HVOF",
    }
    for line in V7.lines:
        if line.process_energy_mj is None or line.process_carbon_kg is None:
            continue
        if line.process_energy_mj <= 0:
            continue
        ratio = line.process_carbon_kg / line.process_energy_mj
        if ratio > 0.002 and line.sku not in gas_fired:
            note = (line.process_note or "").lower()
            assert any(word in note for word in CONSUMABLE_WORDS), (
                f"{line.sku} carries {ratio:.4f} kg/MJ with no stated non-electric contributor"
            )


def test_biogenic_storage_is_credited_uniformly() -> None:
    for sku in PLANT_FIBRES:
        line = V7.line(sku)
        assert line is not None
        carbon = line.properties.carbon_kg_co2e
        assert carbon is not None and carbon < 0, sku
    assert "biogenic" in V7.course_note


def test_the_notes_claims_hold_against_the_figures() -> None:
    a36 = V7.line("LMS-A36-PL06")
    galvanised = V7.line("LMS-GALV-SH10")
    assert a36 and galvanised
    assert galvanised.properties.carbon_kg_co2e == pytest.approx(
        a36.properties.carbon_kg_co2e + 0.2  # type: ignore[operator]
    )
    energies = [
        line.properties.embodied_energy_mj_kg
        for line in V7.lines
        if line.properties.embodied_energy_mj_kg
    ]
    hempcrete = V7.line("TFC-HEMPBLK")
    assert hempcrete and hempcrete.properties.embodied_energy_mj_kg == min(energies)
    case = V7.line("MFW-HT-CASE")
    nitride = V7.line("MFW-HT-NITRIDE")
    assert case and nitride and case.process_energy_mj < nitride.process_energy_mj  # type: ignore[operator]
    assert "second" in (case.process_note or "")
    carbide = V7.line("VHM-WC6-INS")
    assert carbide and carbide.properties.end_of_life_recovery_percent == 50
    assert all(
        line.properties.min_service_temp_c is not None
        for line in V7.lines
        if line.supplier == "VHM" and not line.service
    )


def test_v7_reproduces_from_its_script(tmp_path: Path) -> None:
    script = Path(__file__).resolve().parents[2] / "scripts" / "revise_catalogue_v7.py"
    shipped = (CATALOGUE_ROOT / "bree-216" / "v7.json").read_text(encoding="utf-8")
    source = script.read_text(encoding="utf-8").replace(
        'ROOT = Path(__file__).resolve().parent.parent / "catalogue" / "bree-216"',
        f"ROOT = Path({str(tmp_path)!r})",
    )
    (tmp_path / "v6.json").write_text(
        (CATALOGUE_ROOT / "bree-216" / "v6.json").read_text(encoding="utf-8"), encoding="utf-8"
    )
    copy = tmp_path / "revise.py"
    copy.write_text(source, encoding="utf-8")
    subprocess.run([sys.executable, "-I", str(copy)], check=True, capture_output=True)
    assert json.loads((tmp_path / "v7.json").read_text(encoding="utf-8")) == json.loads(shipped)
