"""A shop's published price, kept beside the catalogue list (decision 0111).

The list price is what a quotation uses. A market check is one reading of a
public product page for a comparable cut of the same grade. The page names a
size of its own, which is not this line's size. When the page does not answer,
or no longer carries the cut we asked for, the previous reading stays and the
check is marked stale. A line with no mapping, and a mapping that has never
succeeded, has no check.
"""

from __future__ import annotations

import json
import os
from collections.abc import Sequence
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field

CHECKS_NAME = "market-checks.json"
_ZONE = ZoneInfo("America/Toronto")
_MAX_BODY = 2_000_000


class MarketSource(BaseModel):
    sku: str
    url: str
    page: str
    variant: str
    what: str


class MarketSources(BaseModel):
    store: str
    place: str
    currency: str
    listings: list[MarketSource] = Field(min_length=1)


class MarketCheck(BaseModel):
    """What the line page may show. No error text: a failed read is `stale`.

    `cents` is the shop's published price, before tax. `with_tax_cents` is that
    price plus the catalogue's own taxes, rounded the way a quotation rounds
    them. The taxed figure is not a price a quotation uses.
    """

    store: str
    place: str
    page: str
    what: str
    cents: int
    with_tax_cents: int
    currency: str
    observed_on: str
    stale: bool
    # The shop's own product photograph, when the same document that named the
    # price also published one. Absent for every line we have not matched.
    image: str | None = None


def sources_path() -> Path:
    return Path(__file__).resolve().parents[2] / "catalogue" / "bree-216" / "market-sources.json"


def checks_path(data_dir: Path) -> Path:
    return data_dir / CHECKS_NAME


def load_sources(path: Path | None = None) -> MarketSources:
    return MarketSources.model_validate_json((path or sources_path()).read_text(encoding="utf-8"))


def read_checks(path: Path) -> dict[str, dict[str, object]] | None:
    """The stored readings, or None when the file is there but unreadable.

    None is a refusal to continue: a refresh that treated it as empty would
    replace a good file with whatever this run happened to learn.
    """
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        checks = raw["checks"]
    except (OSError, json.JSONDecodeError, KeyError, TypeError):
        return None
    if not isinstance(checks, dict):
        return None
    return {str(sku): record for sku, record in checks.items() if isinstance(record, dict)}


def write_checks(path: Path, checks: dict[str, dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps({"checks": checks}, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def shopify_variant_cents(body: bytes, variant_title: str) -> int | None:
    """The named cut's price in cents, from a Shopify product `.js` document.

    The product-level price is a different number (the smallest cut). Only the
    variant whose title we stored is the figure we meant to read. A missing
    cut, a zero, or a price that is not a whole number of cents is a failed
    read, not a price of zero.
    """
    try:
        payload = json.loads(body)
        variants = payload["variants"]
    except (json.JSONDecodeError, KeyError, TypeError):
        return None
    if not isinstance(variants, list) or len(body) > _MAX_BODY:
        return None
    for variant in variants:
        if not isinstance(variant, dict) or variant.get("title") != variant_title:
            continue
        price = variant.get("price")
        if isinstance(price, int) and not isinstance(price, bool) and price > 0:
            return price
        return None
    return None


def published_image(value: object) -> str | None:
    if isinstance(value, str) and value.startswith("https://cdn.shopify.com/"):
        return value
    return None


def shopify_image_url(body: bytes) -> str | None:
    """The product photograph on a Shopify product document, if it is theirs.

    The address is protocol-relative in the document. Only their image host is
    kept, so a page that answers with some other address is not a picture we
    show.
    """
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return None
    raw = payload.get("featured_image") if isinstance(payload, dict) else None
    if not isinstance(raw, str) or not raw:
        return None
    if raw.startswith("//cdn.shopify.com/"):
        raw = "https:" + raw
    return published_image(raw)


def apply_reading(
    previous: dict[str, object] | None,
    source: MarketSources,
    listing: MarketSource,
    *,
    cents: int | None,
    error: str | None,
    now: int,
    image: str | None = None,
) -> dict[str, object]:
    """Fold one attempt into the stored reading.

    A positive price replaces the figure and clears the failure. Anything else
    keeps the cents and the day they were read, and records that this attempt
    failed. The shop, the page and the description come from the source file,
    so a renamed cut in our notes shows up even when the price is unchanged.
    """
    kept = previous or {}
    if cents is not None and cents > 0:
        return {
            "store": source.store,
            "place": source.place,
            "page": listing.page,
            "what": listing.what,
            "cents": cents,
            "currency": source.currency,
            "observed_at": now,
            "last_attempt_at": now,
            "last_error": None,
            "image": image or kept.get("image"),
        }
    return {
        "store": source.store,
        "place": source.place,
        "page": listing.page,
        "what": listing.what,
        "cents": kept.get("cents"),
        "currency": source.currency,
        "observed_at": kept.get("observed_at"),
        "last_attempt_at": now,
        "last_error": error or "no price",
        "image": kept.get("image"),
    }


def cents_with_taxes(cents: int, rates: Sequence[float]) -> int:
    """Published cents plus each catalogue tax, each on the pre-tax amount.

    GST and QST are not stacked on one another. `round` is the same function
    a quotation uses, so the two cannot disagree about a cent.
    """
    return cents + sum(round(cents * rate) for rate in rates)


def observed_on(timestamp: int) -> str:
    day = datetime.fromtimestamp(timestamp, _ZONE)
    return f"{day.day} {day.strftime('%b %Y')}"


def public_check(record: dict[str, object], rates: Sequence[float] = ()) -> MarketCheck | None:
    """The reading a line page may show, or None when no price was ever kept."""
    cents = record.get("cents")
    observed = record.get("observed_at")
    if not isinstance(cents, int) or isinstance(cents, bool) or cents <= 0:
        return None
    if not isinstance(observed, int) or isinstance(observed, bool):
        return None
    try:
        return MarketCheck(
            store=str(record["store"]),
            place=str(record["place"]),
            page=str(record["page"]),
            what=str(record["what"]),
            cents=cents,
            with_tax_cents=cents_with_taxes(cents, rates),
            currency=str(record["currency"]),
            observed_on=observed_on(observed),
            stale=record.get("last_error") not in (None, ""),
            image=published_image(record.get("image")),
        )
    except (KeyError, TypeError, ValueError):
        return None
