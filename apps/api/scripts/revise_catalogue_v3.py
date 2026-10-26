"""Derive bree-216 catalogue v3 from v2 (decision 0110, catalogue changelog v3).

v3 is v2 plus the environmental layer from the BREE 216 Marketplace 2 teaching
page: cradle-to-gate carbon, water, a realistic end-of-life recovery, the
lowest useful temperature, an end-of-life note, and, for a process, energy and
carbon per unit of process. Prices, mechanical properties other than embodied
energy, and the property-sheet recyclability are left as v2 has them. Recovery
is stored beside recyclability, because the gap between the two is the point.

Lines the teaching page adds (new SKUs, the packaging supplier) are not part
of this revision. A catalogue grows by a revision that says so, not by a
feature that was asked for as an overlay.

    .venv/bin/python scripts/revise_catalogue_v3.py

Re-running rewrites v3.json identically. Nothing here touches v1.json or v2.json.
"""

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent / "catalogue" / "bree-216"
SOURCE = Path(__file__).resolve().parents[3] / "BREE 216 Marketplace 2.html"

SENTENCE = (
    "Version 3 adds cradle-to-gate carbon, water, a realistic end-of-life "
    "recovery kept apart from the property-sheet recyclability, the lowest "
    "useful service temperature, and, for a process, energy and carbon per "
    "unit of process."
)

_ENV_CALL = re.compile(
    r"(?<![A-Za-z])env\(\s*\[(.*?)\]\s*,\s*\{(.*?)\}\s*\)\s*;",
    re.DOTALL,
)
_PENV_CALL = re.compile(
    r'penv\(\s*"([^"]+)"\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*"((?:\\.|[^"\\])*)"\s*\)\s*;',
    re.DOTALL,
)
_SKU = re.compile(r'"([^"]+)"')
_NUMBER = re.compile(
    r"(?:^|[,{\s])(ee|co2|h2o|recy|tmin)\s*:\s*(-?\d+(?:\.\d+)?)",
)
_EOL = re.compile(r'eol\s*:\s*"((?:\\.|[^"\\])*)"', re.DOTALL)


def _number(token: str) -> int | float:
    return float(token) if "." in token else int(token)


def _unescape(text: str) -> str:
    return text.replace(r"\"", '"').replace(r"\\", "\\")


def parse_environment(source: str) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    """The material records and the process records, keyed by SKU."""
    materials: dict[str, dict[str, Any]] = {}
    for skus, body in _ENV_CALL.findall(source):
        record: dict[str, Any] = {key: _number(value) for key, value in _NUMBER.findall(body)}
        missing = {"ee", "co2", "h2o", "recy"} - record.keys()
        if missing:
            raise SystemExit(f"an env() record is missing {sorted(missing)}: {body[:80]}")
        prose = _EOL.search(body)
        if prose:
            record["eol"] = _unescape(prose.group(1))
        for sku in _SKU.findall(skus):
            if sku in materials:
                raise SystemExit(f"{sku} is given an environmental record twice")
            materials[sku] = record

    processes: dict[str, dict[str, Any]] = {}
    for sku, energy, carbon, note in _PENV_CALL.findall(source):
        if sku in processes:
            raise SystemExit(f"{sku} is given a process footprint twice")
        processes[sku] = {
            "pe": _number(energy),
            "pco2": _number(carbon),
            "pnote": _unescape(note),
        }
    overlap = materials.keys() & processes.keys()
    if overlap:
        raise SystemExit(f"both a material and a process record: {sorted(overlap)}")
    if not materials or not processes:
        raise SystemExit("the indicator table did not parse")
    return materials, processes


def revise(
    v2: dict[str, Any],
    materials: dict[str, dict[str, Any]],
    processes: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any], list[str]]:
    v3: dict[str, Any] = json.loads(json.dumps(v2))
    v3["version"] = 3
    note = v3["course_note"].rstrip()
    if SENTENCE not in note:
        v3["course_note"] = f"{note} {SENTENCE}"
    by_sku = {line["sku"]: line for line in v3["lines"]}
    skipped: list[str] = []

    for sku, record in materials.items():
        line = by_sku.get(sku)
        if line is None:
            skipped.append(sku)
            continue
        props = line["properties"]
        props["ee"] = record["ee"]
        props["co2"] = record["co2"]
        props["h2o"] = record["h2o"]
        # `recy` on the property sheet stays the theoretical figure. The
        # realistic recovery is a different number and keeps its own key.
        props["recovery"] = record["recy"]
        if "tmin" in record:
            props["tmin"] = record["tmin"]
        if record.get("eol"):
            line["end_of_life"] = record["eol"]

    for sku, record in processes.items():
        line = by_sku.get(sku)
        if line is None:
            skipped.append(sku)
            continue
        line["process_energy_mj"] = record["pe"]
        line["process_carbon_kg"] = record["pco2"]
        line["process_note"] = record["pnote"]

    return v3, skipped


def main() -> None:
    v2 = json.loads((ROOT / "v2.json").read_text(encoding="utf-8"))
    materials, processes = parse_environment(SOURCE.read_text(encoding="utf-8"))
    v3, skipped = revise(v2, materials, processes)
    (ROOT / "v3.json").write_text(
        json.dumps(v3, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    covered = {line["sku"] for line in v3["lines"]}
    gained = sum(
        1
        for sku in covered
        if sku in materials or sku in processes
    )
    print(
        f"wrote {ROOT / 'v3.json'}: {gained} of {len(v3['lines'])} lines carry "
        f"the layer; {len(skipped)} indicator rows skipped (not in v2)"
    )


if __name__ == "__main__":
    main()
