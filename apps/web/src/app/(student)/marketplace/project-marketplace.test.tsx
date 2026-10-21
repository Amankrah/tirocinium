import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LineSummary, ProjectQuotation, QuoteLine } from "@/lib/api/marketplace";
import { ProjectMarketplace } from "./project-marketplace";

// The project marketplace (decision 0100). What these hold to account: the
// client sends quantities and never prices, every figure on the sheet is the
// server's, the page says nothing is saved, and what prints is the quotation
// fixed, with its reference and the basis its prices were struck on.

function line(overrides: Partial<LineSummary> = {}): LineSummary {
  return {
    sku: "LMS-A36-PL06",
    supplier_id: "LMS",
    supplier_name: "Laurentide Metal Supply",
    category: "Plate & sheet",
    name: "ASTM A36 plate",
    spec: "6 mm",
    unit: "kg",
    unit_label: "kg",
    price_cents: 500,
    price_per_kg_cents: 500,
    moq: 25,
    lead_days: 2,
    stock: "in",
    stock_label: "In stock",
    cut_fee_cents: 0,
    swatch: "hrsteel",
    tags: ["weldable"],
    service: false,
    shortlisted: false,
    ...overrides,
  };
}

function quotation(lines: QuoteLine[], notices: string[] = []): ProjectQuotation {
  const priced = lines.map((item, index) => ({
    position: index + 1,
    sku: item.sku,
    supplier_id: "LMS",
    supplier_name: "Laurentide Metal Supply",
    name: "ASTM A36 plate",
    spec: "6 mm",
    unit: "kg",
    unit_label: "kg",
    requested_quantity: item.quantity,
    quantity: item.quantity,
    list_price_cents: 500,
    unit_price_cents: 500,
    break_percent: 0,
    extended_cents: 500 * item.quantity,
    cut_to_length: false,
    cut_count: 1,
    cut_fee_cents: 0,
    mass_grams: item.quantity * 1000,
    lead_days: 2,
  }));
  const goods = priced.reduce((sum, item) => sum + item.extended_cents, 0);
  return {
    reference: "BREE-P-20261021-ABC123",
    catalogue_id: "bree-216",
    catalogue_version: 1,
    prepared_at: 1_792_540_800,
    valid_until: 1_792_540_800 + 14 * 86_400,
    notices,
    lines: priced,
    totals: {
      line_count: priced.length,
      supplier_count: 1,
      goods_cents: goods,
      discount_cents: 0,
      cut_fee_cents: 0,
      freight_cents: 4_500,
      taxes: [],
      tax_cents: 0,
      // A total no client arithmetic would produce, so the sheet can only be
      // showing it because the server said so.
      total_cents: 98_765,
      total_mass_grams: 25_000,
      longest_lead_days: 2,
      cost_per_kg_cents: 500,
    },
  };
}

function renderMarketplace() {
  const browse = vi.fn(async () => ({
    ok: true as const,
    data: { items: [line()], next_cursor: null, total: 1 },
  }));
  const compare = vi.fn();
  const price = vi.fn(async (lines: QuoteLine[]) => ({
    ok: true as const,
    data: quotation(lines, ["LMS-A36-PL06: quantity raised to the 25 kg minimum order."]),
  }));
  const ask = vi.fn();
  render(
    <ProjectMarketplace
      basis="List prices from BREE 216 materials, version 1"
      categories={["Plate & sheet"]}
      suppliers={[{ id: "LMS", name: "Laurentide Metal Supply" }]}
      initialLines={{ items: [line()], next_cursor: null, total: 1 }}
      browse={browse}
      compare={compare as never}
      price={price}
      ask={ask as never}
    />,
  );
  return { browse, price };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProjectMarketplace", () => {
  it("adds a material at its minimum order and sends only quantities", async () => {
    const { price } = renderMarketplace();
    fireEvent.click(screen.getByRole("button", { name: "Add to quote" }));
    await waitFor(() =>
      expect(price).toHaveBeenCalledWith([
        { sku: "LMS-A36-PL06", quantity: 25, cut_to_length: false, cut_count: 1 },
      ]),
    );
  });

  it("shows the server's total and its notices, not figures it worked out", async () => {
    renderMarketplace();
    fireEvent.click(screen.getByRole("button", { name: "Add to quote" }));
    const sheet = await screen.findByRole("complementary", { name: "Your quotation" });
    expect(within(sheet).getByText("$987.65")).toBeDefined();
    expect(within(sheet).getByText(/quantity raised to the 25 kg minimum/)).toBeDefined();
  });

  it("says plainly that nothing is saved", async () => {
    renderMarketplace();
    fireEvent.click(screen.getByRole("button", { name: "Add to quote" }));
    expect(await screen.findByText(/Nothing here is saved/)).toBeDefined();
  });

  it("prints a fixed copy with its reference and price basis", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    renderMarketplace();
    fireEvent.click(screen.getByRole("button", { name: "Add to quote" }));
    const button = await screen.findByRole("button", { name: "Print quotation" });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    fireEvent.click(button);
    expect(print).toHaveBeenCalledTimes(1);

    const printed = document.querySelector("article.print\\:flex");
    expect(printed).not.toBeNull();
    expect(printed?.textContent).toContain("Quotation BREE-P-20261021-ABC123");
    expect(printed?.textContent).toContain("List prices from BREE 216 materials, version 1");
    // On paper the quotation is a record: no inputs and no buttons.
    expect(printed?.querySelector("input, button")).toBeNull();
  });

  it("orders the catalogue by its own order, since there is no shortlist", () => {
    renderMarketplace();
    expect(screen.getByRole("option", { name: "Catalogue order" })).toBeDefined();
  });

  it("does not price an empty basket", async () => {
    const { price } = renderMarketplace();
    fireEvent.click(screen.getByRole("button", { name: "Add to quote" }));
    await screen.findByRole("button", { name: "Clear quotation" });
    price.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Clear quotation" }));
    expect(await screen.findByText("Nothing quoted yet. Add a material to start.")).toBeDefined();
    expect(price).not.toHaveBeenCalled();
  });
});
