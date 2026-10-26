"""Cut-to-size orders (decision 0114).

A service centre sells a piece, not a kilogram: you give the length, the
width where the form has one, and how many, within the minimum, maximum and
increment the shop cuts to, and the shop tells you the mass, the cuts, the
tolerance and the price. This module turns a list of pieces into what the
quote arithmetic already prices, the quantity in the line's unit of sale, and
hands back what a real quotation prints beside it: each piece's mass, the
number of cut pieces, how many stock lengths the order consumes and what is
left of the last one.

Everything is a pure function of the line's stock geometry and the pieces
asked for. A piece the shop cannot cut (too short, longer than the stock,
wider than the plate, off the increment) is a stated refusal, never a silent
rounding, because the refusal is what the student would hear from the shop.
"""

import math
from dataclasses import dataclass

from pydantic import BaseModel, Field

from app.marketplace.catalogue import CUTTABLE_FORMS, CatalogueLine, StockGeometry

MAX_PIECES = 20
MAX_COUNT = 500


class PieceIn(BaseModel):
    """One size of piece and how many of it. Width applies to plate, sheet
    and roll; on a bar or tube it is ignored."""

    length_mm: float = Field(gt=0, le=100_000)
    width_mm: float | None = Field(default=None, gt=0, le=10_000)
    count: int = Field(ge=1, le=MAX_COUNT)


class ComputedPiece(BaseModel):
    length_mm: float
    width_mm: float | None
    count: int
    # The mass of one piece, from the geometry and the density where the form
    # has both, else from the line's mass per unit.
    each_mass_grams: int


@dataclass(frozen=True)
class CutOrder:
    """What a list of pieces comes to in the line's own terms."""

    quantity: float  # in the line's unit of sale
    cut_count: int
    pieces: list[ComputedPiece]
    stock_lengths: int | None
    remnant_mm: float | None
    tolerance_mm: float
    notices: list[str]


class CannotCut(ValueError):
    """The shop would not cut this: the reason is the message."""


def cuttable(line: CatalogueLine) -> bool:
    stock = line.geometry
    return stock is not None and stock.form in CUTTABLE_FORMS and stock.cut is not None


def section_area_mm2(stock: StockGeometry) -> float | None:
    """The cross-section of a bar or tube, for mass from length and density."""
    if stock.form == "bar_round" and stock.diameter_mm:
        return math.pi * stock.diameter_mm**2 / 4
    if stock.form == "bar_flat" and stock.thickness_mm and stock.width_mm:
        return stock.thickness_mm * stock.width_mm
    if stock.form == "tube_round" and stock.diameter_mm and stock.wall_mm:
        inner = stock.diameter_mm - 2 * stock.wall_mm
        return math.pi * (stock.diameter_mm**2 - inner**2) / 4
    if stock.form == "tube_square" and stock.side_mm and stock.wall_mm:
        inner = stock.side_mm - 2 * stock.wall_mm
        return stock.side_mm**2 - inner**2
    if stock.form == "angle" and stock.leg_mm and stock.wall_mm:
        return stock.wall_mm * (2 * stock.leg_mm - stock.wall_mm)
    return None


def _check_length(stock: StockGeometry, value: float, what: str) -> None:
    cut = stock.cut
    assert cut is not None
    if value < cut.min_mm:
        raise CannotCut(f"The shortest {what} we cut is {cut.min_mm:g} mm.")
    if value > cut.max_mm:
        raise CannotCut(
            f"A {what} of {value:g} mm is longer than the stock ({cut.max_mm:g} mm); "
            "ask the supplier to quote it."
        )
    steps = value / cut.increment_mm
    if abs(steps - round(steps)) > 1e-6:
        raise CannotCut(f"We cut in {cut.increment_mm:g} mm steps; {value:g} mm is not on one.")


def _nest(lengths: list[float], stock_mm: float, kerf_mm: float) -> tuple[int, float]:
    """First-fit-decreasing nesting of cut lengths into stock lengths, each
    cut consuming a kerf. Returns the stock lengths used and the remnant of
    the last one."""
    bins: list[float] = []
    for length in sorted(lengths, reverse=True):
        need = length + kerf_mm
        placed = False
        for index, free in enumerate(bins):
            if free >= need:
                bins[index] = free - need
                placed = True
                break
        if not placed:
            bins.append(stock_mm - need)
    remnant = min(bins) if bins else stock_mm
    return len(bins), max(0.0, remnant)


def resolve_pieces(line: CatalogueLine, pieces: list[PieceIn]) -> CutOrder:
    """What these pieces come to for this line, or why they cannot be cut."""
    stock = line.geometry
    if stock is None or stock.cut is None or stock.form not in CUTTABLE_FORMS:
        raise CannotCut(f"{line.sku} is sold by the {line.unit}, not cut to size.")
    if not pieces:
        raise CannotCut("No pieces were given.")
    if len(pieces) > MAX_PIECES:
        raise CannotCut(f"An order carries at most {MAX_PIECES} piece sizes.")
    cut = stock.cut
    density = line.properties.density_kg_m3
    notices: list[str] = []
    computed: list[ComputedPiece] = []

    if stock.form in {"plate", "sheet"}:
        assert stock.width_mm and stock.length_mm and stock.thickness_mm
        total_mass_g = 0.0
        total_area_mm2 = 0.0
        for piece in pieces:
            if piece.width_mm is None:
                raise CannotCut("A plate or sheet piece needs a width as well as a length.")
            long_side, short_side = (
                max(piece.length_mm, piece.width_mm),
                min(piece.length_mm, piece.width_mm),
            )
            _check_length(stock, long_side, "piece")
            _check_length(stock, short_side, "piece")
            if short_side > stock.width_mm or long_side > stock.length_mm:
                raise CannotCut(
                    f"A {piece.length_mm:g} \u00d7 {piece.width_mm:g} mm piece does not fit a "
                    f"{stock.length_mm:g} \u00d7 {stock.width_mm:g} mm sheet; ask the supplier "
                    "to quote it."
                )
            volume_mm3 = stock.thickness_mm * piece.length_mm * piece.width_mm
            if density:
                each_g = volume_mm3 * density / 1e6
            else:
                sheet_mm3 = stock.thickness_mm * stock.width_mm * stock.length_mm
                each_g = line.kg_per_unit * 1000 * volume_mm3 / sheet_mm3
            total_mass_g += each_g * piece.count
            total_area_mm2 += piece.length_mm * piece.width_mm * piece.count
            computed.append(
                ComputedPiece(
                    length_mm=piece.length_mm,
                    width_mm=piece.width_mm,
                    count=piece.count,
                    each_mass_grams=round(each_g),
                )
            )
        count = sum(piece.count for piece in pieces)
        sheet_area = stock.width_mm * stock.length_mm
        sheets = math.ceil(total_area_mm2 / sheet_area - 1e-9)
        if line.unit == "kg":
            quantity = total_mass_g / 1000
            notices.append(
                f"{line.sku}: {count} cut piece{'s' if count != 1 else ''} priced by finished "
                f"cut mass, {quantity:,.2f} kg."
            )
        elif line.unit == "ea":
            quantity = float(sheets)
            notices.append(
                f"{line.sku}: {count} cut piece{'s' if count != 1 else ''} from "
                f"{sheets} sheet{'s' if sheets != 1 else ''}; the sheet is the unit of sale, "
                "so the offcut is yours."
            )
        else:  # m2
            quantity = total_area_mm2 / 1e6
            notices.append(
                f"{line.sku}: {count} cut piece{'s' if count != 1 else ''}, {quantity:,.2f} m²."
            )
        return CutOrder(
            quantity=quantity,
            cut_count=count,
            pieces=computed,
            stock_lengths=sheets,
            remnant_mm=None,
            tolerance_mm=cut.tolerance_mm,
            notices=notices,
        )

    if stock.form == "roll":
        assert stock.roll_width_mm
        total_area_mm2 = 0.0
        for piece in pieces:
            _check_length(stock, piece.length_mm, "cut")
            width = piece.width_mm or stock.roll_width_mm
            if width > stock.roll_width_mm:
                raise CannotCut(f"The roll is {stock.roll_width_mm:g} mm wide.")
            area = piece.length_mm * width
            total_area_mm2 += area * piece.count
            computed.append(
                ComputedPiece(
                    length_mm=piece.length_mm,
                    width_mm=width,
                    count=piece.count,
                    each_mass_grams=round(line.kg_per_unit * 1000 * area / 1e6),
                )
            )
        count = sum(piece.count for piece in pieces)
        quantity = total_area_mm2 / 1e6
        notices.append(
            f"{line.sku}: {count} cut length{'s' if count != 1 else ''} off the roll, "
            f"{quantity:,.2f} m\u00b2."
        )
        return CutOrder(
            quantity=quantity,
            cut_count=count,
            pieces=computed,
            stock_lengths=None,
            remnant_mm=None,
            tolerance_mm=cut.tolerance_mm,
            notices=notices,
        )

    # Bars, tubes, pipe, angle, profile and strip: lengths off stock.
    area_mm2 = section_area_mm2(stock)
    lengths: list[float] = []
    for piece in pieces:
        _check_length(stock, piece.length_mm, "cut")
        if area_mm2 and density:
            each_g = area_mm2 * piece.length_mm * density / 1e6
        else:
            each_g = line.kg_per_unit * 1000 * piece.length_mm / 1000 if line.unit == "m" else 0.0
        lengths.extend([piece.length_mm] * piece.count)
        computed.append(
            ComputedPiece(
                length_mm=piece.length_mm,
                width_mm=None,
                count=piece.count,
                each_mass_grams=round(each_g),
            )
        )
    count = len(lengths)
    total_mm = sum(lengths)
    stock_lengths: int | None = None
    remnant: float | None = None
    if stock.length_mm:
        stock_lengths, remnant = _nest(lengths, stock.length_mm, cut.kerf_mm)
    if line.unit == "m":
        quantity = total_mm / 1000
    elif line.unit == "kg":
        quantity = sum(p.each_mass_grams * p.count for p in computed) / 1000
    else:
        raise CannotCut(f"{line.sku} is sold by the {line.unit}, not by length.")
    unit_word = "kg of finished cut mass" if line.unit == "kg" else "m of cut length"
    notices.append(
        f"{line.sku}: {count} cut piece{'s' if count != 1 else ''}, {quantity:,.2f} {unit_word}"
        + (
            f", from {stock_lengths} stock length{'s' if stock_lengths != 1 else ''} "
            f"with {remnant / 1000:,.2f} m left on the last"
            if stock_lengths is not None and remnant is not None
            else ""
        )
        + "."
    )
    return CutOrder(
        quantity=quantity,
        cut_count=count,
        pieces=computed,
        stock_lengths=stock_lengths,
        remnant_mm=remnant,
        tolerance_mm=cut.tolerance_mm,
        notices=notices,
    )
