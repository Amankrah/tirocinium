"""Derive bree-216 catalogue v6 from v4.

v4 is the challenge catalogue (decision 0112) and still carries the prose em
dashes. v6 is that file with those dashes replaced by colons, so the newest
shipped version has the challenge briefs and the punctuation the line page
uses. Prices, SKUs and figures are unchanged.

    .venv/bin/python scripts/revise_catalogue_v6.py

Re-running rewrites v6.json identically. Nothing here touches v1 to v5.
"""

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent / "catalogue" / "bree-216"

_NOTE = (
    " Version 4 adds the challenge requirements on each brief."
    " Version 6 replaces the em dashes in the prose with colons."
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


def revise(v4: dict[str, Any]) -> dict[str, Any]:
    revised = colons(v4)
    if not isinstance(revised, dict):
        raise TypeError("catalogue root must be an object")
    revised["version"] = 6
    note = revised["course_note"]
    if isinstance(note, str) and not note.endswith(_NOTE):
        revised["course_note"] = note + _NOTE
    return revised


def main() -> None:
    v4 = json.loads((ROOT / "v4.json").read_text(encoding="utf-8"))
    v6 = revise(v4)
    text = json.dumps(v6, ensure_ascii=False, indent=2) + "\n"
    if "—" in text:
        raise SystemExit("v6 still contains an em dash")
    (ROOT / "v6.json").write_text(text, encoding="utf-8")
    print(f"wrote {ROOT / 'v6.json'}")


if __name__ == "__main__":
    main()
