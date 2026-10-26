"""Derive bree-216 catalogue v8 from v7 (decision 0114, catalogue changelog v8).

v8 gives every line a `geometry` block: the geometry on the rack as numbers (a
plate's thickness, width and length; a bar's diameter and length; a tube's
side, wall and length; a roll's width) and, on the forms sold cut to size, the
cutting rule a service centre quotes by: the smallest and largest piece, the
increment, the kerf, the tolerance and the charge per cut piece. Prices,
properties, notes and briefs are untouched; the geometry is read from each
line's own `spec` string by the parser below, with named overrides where the
string is not enough. The cut rules are authored here and said to be so in
the changelog.

    .venv/bin/python scripts/revise_catalogue_v8.py

Re-running rewrites v8.json identically. Nothing here touches v1 to v7.
"""

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent / "catalogue" / "bree-216"

# Cut rules by the way the shop cuts that form. A saw cut on bar and tube; a
# plasma or laser cut on plate; a shear on thin sheet; a saw on polymer and
# composite sheet; a blade on a roll. Fees are per cut piece, in cents,
# authored to sit beside the per-cut charges the catalogue already carried on
# bar and tube.
SAW = {"min_mm": 25, "max_mm": None, "increment_mm": 1, "kerf_mm": 3, "tolerance_mm": 1.5}
PLASMA = {"min_mm": 50, "max_mm": None, "increment_mm": 1, "kerf_mm": 2, "tolerance_mm": 2}
SHEAR = {"min_mm": 50, "max_mm": None, "increment_mm": 1, "kerf_mm": 0, "tolerance_mm": 1}
PANEL_SAW = {"min_mm": 50, "max_mm": None, "increment_mm": 1, "kerf_mm": 3, "tolerance_mm": 1.5}
ROLL = {"min_mm": 100, "max_mm": 50_000, "increment_mm": 10, "kerf_mm": 0, "tolerance_mm": 10}
STRIP = {"min_mm": 300, "max_mm": 100_000, "increment_mm": 10, "kerf_mm": 1, "tolerance_mm": 2}

PLATE_FEE_BY_SUPPLIER = {"LMS": 850, "BSA": 650, "VHM": 900}
SHEET_FEE = 600

MM = r"(\d+(?:\.\d+)?)"


def _num(text: str) -> float:
    return float(text)


def parse_stock(line: dict[str, Any]) -> dict[str, Any] | None:
    """The stock block for one line, from its spec string and category."""
    spec: str = line["spec"]
    unit: str = line["unit"]
    name: str = line["name"].lower()
    category: str = line["category"]
    if line["service"]:
        return {"form": "service"}
    if unit == "L":
        return {"form": "bulk"}
    if category == "Fasteners" and unit == "ea":
        return {"form": "each"}

    # "6 mm · 1220 x 2440 mm" plate or sheet; "12 mm · 300 x 300 mm" tool plate;
    # "50 mm core · 1220 x 2440 mm" panel.
    m = re.match(rf"^{MM} mm(?: core)? · {MM} \u00d7 {MM} mm$", spec)
    if m:
        t, w, length = map(_num, m.groups())
        form = "plate" if unit == "kg" else "sheet"
        fee = PLATE_FEE_BY_SUPPLIER.get(line["supplier"], SHEET_FEE) if unit == "kg" else SHEET_FEE
        rule = PLASMA if (unit == "kg" and t >= 3) else (SHEAR if unit == "kg" else PANEL_SAW)
        return {
            "form": form,
            "thickness_mm": t,
            "width_mm": w,
            "length_mm": length,
            "cut": {**rule, "max_mm": length, "fee_cents": fee},
        }

    # "Ø25 mm · 3.66 m length", "Ø75 mm · 1.0 m", "Ø12 mm · 330 mm", "15M (Ø16 mm) · 6 m"
    m = re.match(rf"^(?:15M \()?Ø{MM} mm\)? · {MM} (m|mm)(?: length)?$", spec)
    if m:
        d, len_text, lu = m.groups()
        length_mm = _num(len_text) * (1000 if lu == "m" else 1)
        return {
            "form": "bar_round",
            "diameter_mm": _num(d),
            "length_mm": length_mm,
            "cut": {**SAW, "max_mm": length_mm, "fee_cents": line["cut_fee_cents"] or 450},
        }

    # "Ø38.1 x 1.65 mm · 6.1 m" round tube
    m = re.match(rf"^Ø{MM} \u00d7 {MM} mm · {MM} m$", spec)
    if m:
        od, wall, length = map(_num, m.groups())
        return {
            "form": "tube_round",
            "diameter_mm": od,
            "wall_mm": wall,
            "length_mm": length * 1000,
            "cut": {**SAW, "max_mm": length * 1000, "fee_cents": line["cut_fee_cents"]},
        }

    # "6 x 50 mm · 3.0 m length", "6 x 50 mm · 500 mm" flat bar
    m = re.match(rf"^{MM} \u00d7 {MM} mm · {MM} (m|mm)(?: length)?$", spec)
    if m and "angle" not in name and "tube" not in name and "beam" not in name:
        t_text, w_text, len_text, lu = m.groups()
        length_mm = _num(len_text) * (1000 if lu == "m" else 1)
        return {
            "form": "bar_flat",
            "thickness_mm": _num(t_text),
            "width_mm": _num(w_text),
            "length_mm": length_mm,
            "cut": {**SAW, "max_mm": length_mm, "fee_cents": line["cut_fee_cents"] or 450},
        }
    if m and "beam" in name:
        depth, flange, len_text, lu = m.groups()
        length_mm = _num(len_text) * (1000 if lu == "m" else 1)
        return {
            "form": "profile",
            "width_mm": _num(flange),
            "thickness_mm": _num(depth),
            "length_mm": length_mm,
            "cut": {**SAW, "max_mm": length_mm, "fee_cents": line["cut_fee_cents"]},
        }

    # "50 x 50 x 3.2 mm · 6.1 m" square tube or angle
    m = re.match(rf"^{MM} \u00d7 {MM} \u00d7 {MM} mm · {MM} m$", spec)
    if m:
        a, _b, t, length = map(_num, m.groups())
        form = "angle" if "angle" in name else "tube_square"
        block: dict[str, Any] = {
            "form": form,
            "wall_mm": t,
            "length_mm": length * 1000,
            "cut": {**SAW, "max_mm": length * 1000, "fee_cents": line["cut_fee_cents"]},
        }
        block["leg_mm" if form == "angle" else "side_mm"] = a
        return block

    # "50 mm NPS · 6.4 m" steel pipe; "50 mm (2 in) NPS · 200 psi" polymer pipe
    m = re.match(rf"^{MM} mm(?: \(\d+ in\))?(?: NPS)? · (?:{MM} m|.*psi.*)$", spec)
    if m and unit == "m":
        nominal = _num(m.group(1))
        length_mm = _num(m.group(2)) * 1000 if m.group(2) else 6000.0
        return {
            "form": "pipe",
            "nominal_mm": nominal,
            "length_mm": length_mm,
            "cut": {**SAW, "max_mm": length_mm, "fee_cents": line["cut_fee_cents"]},
        }

    # "1.27 m wide roll", "1.5 mm · 7 m wide roll", "1.14 mm (45 mil) · 6 m wide"
    m = re.search(rf"{MM} m wide", spec)
    if m and unit == "m2":
        return {
            "form": "roll",
            "roll_width_mm": _num(m.group(1)) * 1000,
            "cut": {**ROLL, "fee_cents": 0},
        }

    # "34 x 1.1 mm · per metre" bandsaw strip
    if "per metre" in spec and unit == "m":
        m = re.match(rf"^{MM} \u00d7 {MM} mm", spec)
        assert m
        return {
            "form": "strip",
            "width_mm": _num(m.group(1)),
            "thickness_mm": _num(m.group(2)),
            "cut": {**STRIP, "fee_cents": 0},
        }

    return None


# Lines whose spec string does not say enough, or says it differently.
OVERRIDES: dict[str, dict[str, Any]] = {
    # Sold per metre by nominal size; a 6 m straight length is the stock.
    "CPP-PEX-25": {
        "form": "pipe",
        "nominal_mm": 25,
        "length_mm": 6000,
        "cut": {**SAW, "max_mm": 6000, "fee_cents": 60},
    },
    # Whole items, never cut.
    "CPP-HDPE-COIL": {"form": "each"},
    "CPP-FILM-6": {"form": "each"},
    "CPP-PVCFIT-T50": {"form": "each"},
    "CPP-HDPE-FUSE": {"form": "each"},
    "BSA-GASK-38": {"form": "each"},
    "BSA-CLAMP-38": {"form": "each"},
    "BSA-FILL-316L": {"form": "bulk"},
    "VHM-STEL-6": {"form": "bulk"},
    "VHM-WCROD-HF": {"form": "bulk"},
    "VHM-WC10-BLK": {"form": "each"},
    "VHM-WC6-INS": {"form": "each"},
    "VHM-AL2O3-PL": {"form": "each"},
    "VHM-SIC-TILE": {"form": "each"},
    "VHM-SI3N4-BALL": {"form": "each"},
    "TFC-HEMPBLK": {"form": "each"},
    "TFC-FRP-GRT38": {
        "form": "roll",
        "roll_width_mm": 1220,
        "cut": {**PANEL_SAW, "max_mm": 3660, "fee_cents": 800},
    },
    # A 3 mm PTFE sheet sold as a 300 mm square; a cut piece is a saw cut.
    "CPP-PTFE-3": {
        "form": "sheet",
        "thickness_mm": 3,
        "width_mm": 300,
        "length_mm": 300,
        "cut": {**PANEL_SAW, "max_mm": 300, "fee_cents": 300},
    },
    # Core sheets sold per square metre: cut like a panel.
    "TFC-CORE-15": {
        "form": "sheet",
        "thickness_mm": 15,
        "width_mm": 1220,
        "length_mm": 2440,
        "cut": {**PANEL_SAW, "max_mm": 2440, "fee_cents": 300},
    },
    "TFC-BALSA-12": {
        "form": "sheet",
        "thickness_mm": 12,
        "width_mm": 610,
        "length_mm": 1220,
        "cut": {**PANEL_SAW, "max_mm": 1220, "fee_cents": 300},
    },
    "TFC-SIP-50": {
        "form": "sheet",
        "thickness_mm": 50,
        "width_mm": 1220,
        "length_mm": 2440,
        "cut": {**PANEL_SAW, "max_mm": 2440, "fee_cents": 800},
    },
}


def revise(v7: dict[str, Any]) -> dict[str, Any]:
    v8: dict[str, Any] = json.loads(json.dumps(v7))
    v8["version"] = 8
    v8["course_note"] = v8["course_note"] + (
        " Version 8 states each line's stock geometry and, on forms sold cut to size, "
        "the cutting rule a service centre quotes by, so a piece can be ordered by its "
        "dimensions."
    )
    missing: list[str] = []
    for line in v8["lines"]:
        stock = OVERRIDES.get(line["sku"]) or parse_stock(line)
        if stock is None:
            missing.append(f"{line['sku']}: {line['spec']}")
            continue
        line["geometry"] = stock
    assert not missing, "no stock geometry for: " + "; ".join(missing)
    return v8


def main() -> None:
    v7 = json.loads((ROOT / "v7.json").read_text(encoding="utf-8"))
    v8 = revise(v7)
    (ROOT / "v8.json").write_text(
        json.dumps(v8, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    forms: dict[str, int] = {}
    for line in v8["lines"]:
        forms[line["geometry"]["form"]] = forms.get(line["geometry"]["form"], 0) + 1
    print(f"wrote {ROOT / 'v8.json'}: {forms}")


if __name__ == "__main__":
    main()
