"""The one-time download artifacts (frontend guide 4.0b): a CSV for the
professor's roster spreadsheet and a print-ready PDF of code cards, eight
per page with cut lines. Both are generated once at issuance, stored behind
short-lived presigned URLs, and never reproducible afterwards."""

import csv
import io

from fpdf import FPDF

RULE_LINE = "Keep this card. Your code is your seat, for the whole term."


def build_csv(rows: list[tuple[str, str]]) -> bytes:
    """rows: (seat_number, formatted_code)."""
    out = io.StringIO(newline="")
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(["seat_number", "code"])
    writer.writerows(rows)
    return out.getvalue().encode("utf-8")


def build_pdf(course_title: str, rows: list[tuple[str, str]]) -> bytes:
    """Eight cards per A4 page (2 x 4) with dashed cut lines."""
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=False)
    pdf.set_margins(0, 0, 0)

    card_w, card_h = 105.0, 74.25  # A4 quartered per column
    per_page = 8

    for i, (seat_number, code) in enumerate(rows):
        slot = i % per_page
        if slot == 0:
            pdf.add_page()
            pdf.set_draw_color(180, 180, 180)
            pdf.set_dash_pattern(dash=2, gap=2)
            for x in (card_w,):
                pdf.line(x, 0, x, 297)
            for y in (card_h, 2 * card_h, 3 * card_h):
                pdf.line(0, y, 210, y)
            pdf.set_dash_pattern()

        x0 = (slot % 2) * card_w
        y0 = (slot // 2) * card_h

        pdf.set_text_color(22, 26, 35)  # ink
        pdf.set_xy(x0 + 10, y0 + 12)
        pdf.set_font("Helvetica", style="B", size=16)
        pdf.cell(text="Tirocinium")

        pdf.set_xy(x0 + 10, y0 + 24)
        pdf.set_font("Helvetica", size=11)
        pdf.cell(text=course_title[:44])

        pdf.set_xy(x0 + 10, y0 + 32)
        pdf.set_font("Helvetica", size=10)
        pdf.set_text_color(90, 90, 90)
        pdf.cell(text=f"Seat {seat_number}")

        pdf.set_xy(x0 + 10, y0 + 44)
        pdf.set_font("Courier", style="B", size=14)
        pdf.set_text_color(22, 26, 35)
        pdf.cell(text=code)

        pdf.set_xy(x0 + 10, y0 + 58)
        pdf.set_font("Helvetica", size=8)
        pdf.set_text_color(120, 120, 120)
        pdf.cell(text=RULE_LINE)

    return bytes(pdf.output())
