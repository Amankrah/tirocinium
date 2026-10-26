"""Read the mapped shop pages and keep the last good price (decision 0111).

A page that does not answer, or no longer has the cut we named, leaves the
previous figure in place. The catalogue list price is not written.

    .venv/bin/python scripts/refresh_market_checks.py

The readings go to ``$TIRO_DATA_DIR/market-checks.json``. One request per
distinct page, a second apart, with a browser-plain user agent. The weekly
timer on the host runs this; it is not part of the test gate.
"""

from __future__ import annotations

import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app.env  # noqa: F401  (loads apps/api/.env so TIRO_DATA_DIR is set)
from app.marketplace.market_check import (
    apply_reading,
    checks_path,
    load_sources,
    read_checks,
    shopify_variant_cents,
    write_checks,
)

_AGENT = "Tirocinium market check (https://tirocinium.sasellab.com)"
_TIMEOUT_SECONDS = 20
_PAUSE_SECONDS = 1


def _data_dir() -> Path:
    import os

    return Path(os.environ.get("TIRO_DATA_DIR", "data"))


def fetch(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": _AGENT, "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
        body = response.read(2_000_001)
    if not isinstance(body, bytes) or len(body) > 2_000_000:
        raise RuntimeError("response too large")
    return body


def main() -> int:
    source = load_sources()
    path = checks_path(_data_dir())
    stored = read_checks(path)
    if stored is None:
        print(f"refusing to write: {path} is unreadable", file=sys.stderr)
        return 1

    pages: dict[str, bytes | Exception] = {}
    for listing in source.listings:
        if listing.url in pages:
            continue
        if pages:
            time.sleep(_PAUSE_SECONDS)
        try:
            pages[listing.url] = fetch(listing.url)
        except (urllib.error.URLError, TimeoutError, RuntimeError) as exc:
            pages[listing.url] = exc

    now = int(time.time())
    mapped = {item.sku for item in source.listings}
    stored = {sku: row for sku, row in stored.items() if sku in mapped}
    for listing in source.listings:
        got = pages[listing.url]
        cents: int | None
        error: str | None
        if isinstance(got, Exception):
            cents = None
            error = type(got).__name__
        else:
            cents = shopify_variant_cents(got, listing.variant)
            error = None if cents is not None else "cut not on the page"
        stored[listing.sku] = apply_reading(
            stored.get(listing.sku),
            source,
            listing,
            cents=cents,
            error=error,
            now=now,
        )
        state = "kept" if stored[listing.sku].get("last_error") else "read"
        print(f"{listing.sku} {state}")

    write_checks(path, stored)
    return 0


if __name__ == "__main__":
    sys.exit(main())
