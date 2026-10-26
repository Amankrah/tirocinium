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


def test_v6_is_v4_with_colons() -> None:
    v4 = load_catalogue("bree-216", 4)
    v6 = load_catalogue("bree-216", 6)
    assert v6.version == 6
    assert [(line.sku, line.list_price_cents) for line in v6.lines] == [
        (line.sku, line.list_price_cents) for line in v4.lines
    ]
    assert v6.briefs[0].requirements
    text = _V5.with_name("v6.json").read_text(encoding="utf-8")
    assert "—" not in text
    galv = v6.line("LMS-GALV-SH10")
    assert galv is not None
    assert "faces: roughly 20" in galv.description

