"""Seeded price synthesis (milestone 10.2, decision 0062).

A price is not a property of a catalogue line. It is a property of a line and a
variant together: `price(line, seed)`, pure, in integer cents. Two students
working the same case study already hold different numbers because that is what
the variant pool is for, and a fixed price list would have handed them back a
shared answer at the exact point where the answer becomes a dollar figure.

The perturbation is drawn inside the line's own authored volatility band, so a
shop rate barely moves, commodity mild steel moves a little, and a
molybdenum-bearing stainless moves a lot. That is both the anti-copying
property and the truth of the trade.

This lives in Python beside `app.variants.sampling`, which is the same kind of
seeded pure function. The mandated-Rust code is the numeric comparer and the
mastery arithmetic, not this (the precedent is decision 0030).
"""

import hashlib
import random

from app.marketplace.catalogue import Catalogue, CatalogueLine


# Drawn from a fixed 64-bit slice of a SHA-256 over the seed and the SKU rather
# than from `random.Random(str)`, so the mapping is a documented property of
# this module and not an implementation detail of the standard library that a
# Python upgrade could reasonably change. A stored quotation is evidence; the
# price behind it has to be reproducible for as long as the row exists.
def _line_rng(seed: int, sku: str) -> random.Random:
    digest = hashlib.sha256(f"{seed}:{sku}".encode()).digest()
    return random.Random(int.from_bytes(digest[:8], "big"))


def line_price_cents(line: CatalogueLine, seed: int) -> int:
    """This line's price for the variant with this seed, in cents.

    Never below one cent: a band can scale a $0.78 nyloc nut, and a free line
    item is a different kind of lesson from the one intended.
    """
    if line.volatility <= 0:
        return line.list_price_cents
    rng = _line_rng(seed, line.sku)
    factor = 1.0 + rng.uniform(-line.volatility, line.volatility)
    return max(1, round(line.list_price_cents * factor))


def variant_prices(catalogue: Catalogue, seed: int) -> dict[str, int]:
    """Every line's price for one variant. Each line is drawn independently, so
    adding a line to the catalogue never shifts the price of any other."""
    return {line.sku: line_price_cents(line, seed) for line in catalogue.lines}


def price_band_cents(line: CatalogueLine) -> tuple[int, int]:
    """The closed interval this line's seeded price can fall in.

    Used by the ordering gate: two lines can never swap rank if their bands do
    not overlap, which is how the catalogue's pedagogically load-bearing
    comparisons are shown to survive every possible seed rather than the
    thousand a test happens to try.
    """
    low = max(1, round(line.list_price_cents * (1.0 - line.volatility)))
    high = max(1, round(line.list_price_cents * (1.0 + line.volatility)))
    return low, high


def orders_are_stable(first: CatalogueLine, second: CatalogueLine) -> bool:
    """True when `first` is cheaper than `second` under every seed there is.

    A False here is not a defect. Galvanised steel and aluminium really do
    trade places per metre when the market moves, and a student who learns that
    from the catalogue has learned something true.
    """
    return price_band_cents(first)[1] < price_band_cents(second)[0]
