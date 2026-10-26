"""Catalogue v5 is v3's prose with colons in place of em dashes."""

from pathlib import Path

from app.marketplace.catalogue import load_catalogue

_V5 = Path(__file__).resolve().parents[2] / "catalogue" / "bree-216" / "v5.json"


def test_v5_keeps_v3_prices_and_drops_the_em_dashes() -> None:
    v3 = load_catalogue("bree-216", 3)
    v5 = load_catalogue("bree-216", 5)
    assert v5.version == 5
    assert [(line.sku, line.list_price_cents) for line in v5.lines] == [
        (line.sku, line.list_price_cents) for line in v3.lines
    ]
    text = _V5.read_text(encoding="utf-8")
    assert "—" not in text
    galv = v5.line("LMS-GALV-SH10")
    assert galv is not None
    assert "faces: roughly 20" in galv.description
    assert "bare steel: zinc-rich paint" in galv.fabrication
