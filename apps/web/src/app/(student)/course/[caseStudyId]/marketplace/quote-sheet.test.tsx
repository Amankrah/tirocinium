import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Quote } from "@/lib/api/marketplace";
import { QuoteSheet } from "./quote-sheet";

// The quotation sheet (Phase 10, decision 0062). Two things carry it: every
// figure shown is the server's, and an issued quotation stops being editable
// and starts being a record.

function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 7,
    variant_id: 3,
    status: "draft",
    quote_number: null,
    catalogue_id: "bree-216",
    catalogue_version: 1,
    created_at: 1_757_000_000,
    issued_at: null,
    valid_until: null,
    notices: [],
    lines: [
      {
        position: 1,
        sku: "LMS-A36-PL06",
        supplier_id: "LMS",
        supplier_name: "Laurentide Metal Supply",
        name: "ASTM A36 plate",
        spec: "6 mm",
        unit: "kg",
        unit_label: "kg",
        requested_quantity: 100,
        quantity: 100,
        list_price_cents: 500,
        unit_price_cents: 480,
        break_percent: 4,
        extended_cents: 48_000,
        cut_to_length: false,
        cut_count: 1,
        cut_fee_cents: 0,
        mass_grams: 100_000,
        lead_days: 2,
      },
    ],
    totals: {
      line_count: 1,
      supplier_count: 1,
      goods_cents: 48_000,
      discount_cents: 2_000,
      cut_fee_cents: 0,
      freight_cents: 13_000,
      taxes: [
        { code: "GST", rate: 0.05, amount_cents: 3_050 },
        { code: "QST", rate: 0.09975, amount_cents: 6_085 },
      ],
      tax_cents: 9_135,
      total_cents: 70_135,
      total_mass_grams: 100_000,
      longest_lead_days: 2,
      cost_per_kg_cents: 480,
    },
    ...overrides,
  };
}

function renderSheet(value: Quote | null, pending = false) {
  const handlers = {
    onQuantity: vi.fn(),
    onCut: vi.fn(),
    onRemove: vi.fn(),
    onIssue: vi.fn(),
    onDiscard: vi.fn(),
    onStartAnother: vi.fn(),
  };
  render(<QuoteSheet quote={value} pending={pending} {...handlers} />);
  return handlers;
}

afterEach(() => vi.clearAllMocks());

describe("QuoteSheet", () => {
  it("says an empty basket is empty rather than showing a zero total", () => {
    renderSheet(null);
    expect(screen.getByText("Nothing quoted yet. Add a material to start.")).toBeDefined();
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("shows the server's totals, tax by tax", () => {
    renderSheet(quote());
    const figure = (label: string) =>
      screen.getByText(label).parentElement?.querySelector("dd")?.textContent;
    expect(figure("Materials")).toBe("$480.00");
    expect(figure("Volume discount")).toBe("−$20.00");
    expect(figure("Freight")).toBe("$130.00");
    expect(figure("GST")).toBe("$30.50");
    expect(figure("QST")).toBe("$60.85");
    expect(figure("Total")).toBe("$701.35");
  });

  it("reports a basket with no mass as not applicable, never as zero", () => {
    // Decision 0048: an empty denominator is "we cannot say", not a figure that
    // reads like a finding.
    renderSheet(
      quote({
        totals: { ...quote().totals, total_mass_grams: 0, cost_per_kg_cents: null },
      }),
    );
    expect(screen.getByText("Not applicable to shop time")).toBeDefined();
  });

  it("shows the server's notices rather than swallowing them", () => {
    // A quantity silently raised to a minimum order is a number the student
    // cannot account for in their defence.
    renderSheet(
      quote({ notices: ["LMS-A36-PL06: quantity raised to the 25 kg minimum order."] }),
    );
    expect(
      screen.getByText("LMS-A36-PL06: quantity raised to the 25 kg minimum order."),
    ).toBeDefined();
  });

  it("commits a changed quantity on blur, and not on every keystroke", () => {
    const { onQuantity } = renderSheet(quote());
    const field = screen.getByLabelText("Quantity in kg");
    fireEvent.change(field, { target: { value: "250" } });
    expect(onQuantity).not.toHaveBeenCalled();
    fireEvent.blur(field);
    expect(onQuantity).toHaveBeenCalledWith("LMS-A36-PL06", 250);
  });

  it("ignores a quantity that is not a quantity", () => {
    const { onQuantity } = renderSheet(quote());
    const field = screen.getByLabelText("Quantity in kg");
    fireEvent.change(field, { target: { value: "0" } });
    fireEvent.blur(field);
    expect(onQuantity).not.toHaveBeenCalled();
  });

  it("names its number and validity once issued", () => {
    renderSheet(
      quote({
        status: "issued",
        quote_number: "BREE-20260914-0007",
        issued_at: 1_757_000_000,
        valid_until: 1_758_209_600,
      }),
    );
    expect(screen.getByText("Quotation BREE-20260914-0007")).toBeDefined();
    expect(screen.getByText(/^Valid until /)).toBeDefined();
  });

  it("stops being editable once issued", () => {
    renderSheet(quote({ status: "issued", quote_number: "BREE-20260914-0007" }));
    expect(screen.queryByLabelText("Quantity in kg")).toBeNull();
    expect(screen.queryByRole("button", { name: "Issue this quote" })).toBeNull();
    expect(screen.getByRole("button", { name: "Start another quote" })).toBeDefined();
  });

  it("does not let a student issue twice by double-clicking", () => {
    renderSheet(quote(), true);
    const issue = screen.getByRole("button", { name: "Issuing…" });
    expect(issue.hasAttribute("disabled")).toBe(true);
  });
});
