"""Catalogue v9 (decision 0116): three materials project groups asked for.

What these hold to account. v9 is v8 with three lines added and nothing else
moved, so a quotation or a challenge struck against v8 reads the same lines in
v9. Each new line carries everything a v8 line carries: the full environmental
layer and a geometry block, and the borosilicate sheet's stated mass follows
from its own dimensions and density. The hybrid's footprint is the mass-
weighted mean of the two fibres it is woven from, as its note says. The notes'
comparative claims hold against the figures. And the revision reproduces from
its script byte for byte, like every revision before it.
"""

import json
import subprocess
import sys
from pathlib import Path

from app.marketplace.catalogue import CATALOGUE_ROOT, load_catalogue
from app.marketplace.cutting import PieceIn, resolve_pieces

V8 = load_catalogue("bree-216", 8)
V9 = load_catalogue("bree-216", 9)

ADDED = {"TFC-SG-300", "TFC-CGH-200", "CPP-BORO-5"}

# The properties under the asset's own short keys, which the notes are written
# against.
RAW = {
    entry["sku"]: entry["properties"]
    for entry in json.loads((CATALOGUE_ROOT / "bree-216" / "v9.json").read_text(encoding="utf-8"))[
        "lines"
    ]
}


def line(sku: str):  # type: ignore[no-untyped-def]
    found = V9.line(sku)
    assert found is not None, sku
    return found


def test_nothing_but_three_lines_was_added() -> None:
    v8 = [old.model_dump() for old in V8.lines]
    kept = [new.model_dump() for new in V9.lines if new.sku not in ADDED]
    assert kept == v8
    assert {new.sku for new in V9.lines} - {old.sku for old in V8.lines} == ADDED
    assert [brief.model_dump() for brief in V9.briefs] == [
        brief.model_dump() for brief in V8.briefs
    ]


def test_each_new_line_carries_what_a_v8_line_carries() -> None:
    for sku in ADDED:
        new = line(sku)
        assert new.geometry is not None, sku
        assert new.supplier in {supplier.id for supplier in V9.suppliers}
        props = RAW[sku]
        for field in ("co2", "h2o", "recovery", "tmin", "ee"):
            assert props.get(field) is not None, (sku, field)
        assert new.end_of_life


def test_the_borosilicate_sheet_mass_follows_from_its_dimensions() -> None:
    boro = line("CPP-BORO-5")
    stock = boro.geometry
    assert stock is not None and stock.form == "sheet"
    assert stock.thickness_mm and stock.width_mm and stock.length_mm
    density = RAW["CPP-BORO-5"]["rho"]
    mass = stock.thickness_mm * stock.width_mm * stock.length_mm * density / 1e9
    assert abs(mass - boro.kg_per_unit) / boro.kg_per_unit < 0.01


def test_a_borosilicate_piece_is_cut_from_whole_sheets() -> None:
    # Four 400 x 500 mm panels are 0.8 m² of a 1.2 m² sheet: one sheet.
    order = resolve_pieces(line("CPP-BORO-5"), [PieceIn(length_mm=500, width_mm=400, count=4)])
    assert order.quantity == 1
    assert order.cut_count == 4
    # Seven need a second.
    order = resolve_pieces(line("CPP-BORO-5"), [PieceIn(length_mm=500, width_mm=400, count=7)])
    assert order.quantity == 2


def test_the_hybrid_footprint_is_the_mass_weighted_mean_of_its_fibres() -> None:
    hybrid, carbon, glass = RAW["TFC-CGH-200"], RAW["TFC-CF-200"], RAW["TFC-EG-200"]
    for field in ("ee", "co2", "h2o"):
        assert hybrid[field] == (carbon[field] + glass[field]) / 2, field


def test_the_notes_claims_hold_against_the_figures() -> None:
    s_glass, hybrid = line("TFC-SG-300"), line("TFC-CGH-200")
    e_cloth, carbon = line("TFC-EG-200"), line("TFC-CF-200")
    # "roughly four times the price of E-glass cloth"
    assert 3.5 < s_glass.list_price_cents / e_cloth.list_price_cents < 4.5
    # "stretches 5.4 % ... where carbon manages 1.5 %"
    assert RAW["TFC-SG-300"]["el"] == 5.4
    assert RAW["TFC-CF-200"]["el"] == 1.5
    # "about two thirds of carbon's [modulus] for a little over half its price"
    hp, cp = RAW["TFC-CGH-200"], RAW["TFC-CF-200"]
    assert 0.6 < hp["E"] / cp["E"] < 0.7
    assert 0.5 < hybrid.list_price_cents / carbon.list_price_cents < 0.6
    # "fracture toughness is about a quarter of polycarbonate's"
    toughness = RAW["CPP-BORO-5"]["kic"]
    for sku in ("CPP-PC-TW8", "CPP-PC-TW16", "CPP-PC-SOL6"):
        ratio = toughness / RAW[sku]["kic"]
        assert 0.2 < ratio < 0.3, sku


def test_v9_reproduces_from_its_script(tmp_path: Path) -> None:
    script = Path(__file__).resolve().parents[2] / "scripts" / "revise_catalogue_v9.py"
    shipped = (CATALOGUE_ROOT / "bree-216" / "v9.json").read_bytes()
    source = script.read_text(encoding="utf-8").replace(
        'ROOT = Path(__file__).resolve().parent.parent / "catalogue" / "bree-216"',
        f"ROOT = Path({str(tmp_path)!r})",
    )
    (tmp_path / "v8.json").write_bytes((CATALOGUE_ROOT / "bree-216" / "v8.json").read_bytes())
    copy = tmp_path / "revise.py"
    copy.write_text(source, encoding="utf-8")
    subprocess.run([sys.executable, "-I", str(copy)], check=True, capture_output=True)
    assert (tmp_path / "v9.json").read_bytes() == shipped
    assert json.loads(shipped)["version"] == 9
