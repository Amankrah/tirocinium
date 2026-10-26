import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LineDetail, ProjectQuotation, QuoteLine } from "@/lib/api/marketplace";
import { CutToSize } from "./cut-to-size";

// Ordering by the piece (decision 0114). What these hold to account: the
// panel sends dimensions and a count and never a price or a mass; every
// figure it shows is the server's; a shop's refusal is shown as the shop
// said it; and the add hands the pieces, not the figures, to the basket.

const tube = {
  sku: "LMS-HSS-5032",
  name: "Galvanised HSS square tube",
  unit: "m",
  unit_label: "m",
  moq: 6.1,
  price_cents: 1790,
  geometry: {
    form: "tube_square",
    side_mm: 50,
    wall_mm: 3.2,
    length_mm: 6100,
    cut: { min_mm: 25, max_mm: 6100, increment_mm: 1, kerf_mm: 3, tolerance_mm: 1.5, fee_cents: 750 },
  },
} as unknown as LineDetail;

function priced(lines: QuoteLine[]): ProjectQuotation {
  const [line] = lines;
  const count = line!.pieces!.reduce((sum, piece) => sum + piece.count, 0);
  return {
    reference: "BREE-P-1",
    lines: [
      {
        sku: line!.sku,
        name: tube.name,
        unit_label: "m",
        quantity: 4.8,
        unit_price_cents: 1790,
        extended_cents: 8592,
        cut_count: count,
        cut_fee_cents: 750 * count,
        stock_lengths: 1,
        remnant_mm: 1291,
        tolerance_mm: 1.5,
        pieces: line!.pieces!.map((piece) => ({ ...piece, each_mass_grams: 5928 })),
      },
    ],
    totals: { total_cents: 0 },
    notices: [],
  } as unknown as ProjectQuotation;
}

describe("cut to size", () => {
  it("states the shop's rule and previews the server's figures for the pieces typed", async () => {
    const preview = vi.fn(async (lines: QuoteLine[]) => ({ ok: true as const, data: priced(lines) }));
    render(<CutToSize line={tube} preview={preview} onAdd={vi.fn()} />);
    expect(screen.getByText(/Cuts from 25 to 6100 mm in 1 mm steps/)).toBeDefined();

    fireEvent.change(screen.getByLabelText("Length, mm"), { target: { value: "1200" } });
    fireEvent.change(screen.getByLabelText("Pieces"), { target: { value: "4" } });
    await waitFor(() =>
      expect(preview).toHaveBeenLastCalledWith([
        {
          sku: "LMS-HSS-5032",
          quantity: 0,
          cut_to_length: true,
          cut_count: 1,
          pieces: [{ length_mm: 1200, width_mm: null, count: 4 }],
        },
      ]),
    );
    expect(await screen.findByText("4 × 1200 mm")).toBeDefined();
    expect(screen.getByText("5.9 kg each")).toBeDefined();
    const figures = Array.from(document.querySelectorAll("dd")).map((dd) => dd.textContent);
    expect(figures).toContain("4.8 m · $85.92");
    expect(figures).toContain("4 cuts · $30.00");
    expect(figures).toContain("1 length, 1.29 m left");
    // The payload carried no figure the server did not ask for.
    expect(JSON.stringify(preview.mock.calls)).not.toMatch(/mass|cents/);
  });

  it("shows the shop's refusal when a piece cannot be cut, and withholds the add", async () => {
    const preview = vi.fn(async () => ({
      ok: true as const,
      data: {
        reference: null,
        lines: [],
        totals: {},
        notices: ["LMS-HSS-5032: A cut of 9000 mm is longer than the stock (6100 mm); ask the supplier to quote it."],
      } as unknown as ProjectQuotation,
    }));
    render(<CutToSize line={tube} preview={preview} onAdd={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Length, mm"), { target: { value: "9000" } });
    expect(await screen.findByText(/longer than the stock/)).toBeDefined();
    expect(screen.getByRole("button", { name: /Add 1 piece to quote/ })).toHaveProperty("disabled", true);
  });

  it("hands the pieces to the basket on add", async () => {
    const preview = vi.fn(async (lines: QuoteLine[]) => ({ ok: true as const, data: priced(lines) }));
    const onAdd = vi.fn();
    render(<CutToSize line={tube} preview={preview} onAdd={onAdd} />);
    fireEvent.change(screen.getByLabelText("Length, mm"), { target: { value: "1200" } });
    fireEvent.change(screen.getByLabelText("Pieces"), { target: { value: "4" } });
    const button = await screen.findByRole("button", { name: "Add 4 pieces to quote" });
    await waitFor(() => expect(button).toHaveProperty("disabled", false));
    fireEvent.click(button);
    expect(onAdd).toHaveBeenCalledWith([{ length_mm: 1200, width_mm: null, count: 4 }]);
  });
});
