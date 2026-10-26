"""Derive bree-216 catalogue v5 from v3.

v5 is v3 with the prose em dashes replaced by colons. Prices, SKUs, properties
and the environmental figures are unchanged. The line a student reads should
not carry an em dash.

    .venv/bin/python scripts/revise_catalogue_v5.py

Re-running rewrites v5.json identically. Nothing here touches v1, v2, or v3.
"""

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent / "catalogue" / "bree-216"

_NOTE = (
    " Version 5 replaces the em dashes in the prose with colons."
    " Prices and figures are unchanged."
)


def colons(value: Any) -> Any:
    if isinstance(value, str):
        return value.replace(" — ", ": ")
    if isinstance(value, list):
        return [colons(item) for item in value]
    if isinstance(value, dict):
        return {key: colons(item) for key, item in value.items()}
    return value


def revise(v3: dict[str, Any]) -> dict[str, Any]:
    revised = colons(v3)
    if not isinstance(revised, dict):
        raise TypeError("catalogue root must be an object")
    revised["version"] = 5
    note = revised["course_note"]
    if isinstance(note, str) and not note.endswith(_NOTE):
        revised["course_note"] = note + _NOTE
    return revised


def main() -> None:
    v3 = json.loads((ROOT / "v3.json").read_text(encoding="utf-8"))
    v5 = revise(v3)
    text = json.dumps(v5, ensure_ascii=False, indent=2) + "\n"
    if "—" in text:
        raise SystemExit("v5 still contains an em dash")
    (ROOT / "v5.json").write_text(text, encoding="utf-8")
    print(f"wrote {ROOT / 'v5.json'}")


if __name__ == "__main__":
    main()
