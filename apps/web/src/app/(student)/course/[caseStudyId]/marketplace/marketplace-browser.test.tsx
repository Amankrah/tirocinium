import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LineSummary, Quote } from "@/lib/api/marketplace";
import { MarketplaceBrowser } from "./marketplace-browser";

// The marketplace's working surface (Phase 10, decision 0062). What these hold
// to account: the client never prices anything (it sends quantities and shows
// what comes back), filtering narrows without hiding, and a material added to
// the quote starts at its minimum order rather than at one.

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
    price_cents: 520,
    price_per_kg_cents: 520,
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

function pricedQuote(quantity: number): Quote {
  return {
    id: 7,
    variant_id: 3,
    status: "draft",
    quote_number: null,
    catalogue_id: "bree-216",
    catalogue_version: 1,
    created_at: 0,
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
        requested_quantity: quantity,
        quantity,
        list_price_cents: 520,
        unit_price_cents: 520,
        break_percent: 0,
        extended_cents: 520 * quantity,
        cut_to_length: false,
        cut_count: 1,
        cut_fee_cents: 0,
        mass_grams: quantity * 1000,
        lead_days: 2,
      },
    ],
    totals: {
      line_count: 1,
      supplier_count: 1,
      goods_cents: 520 * quantity,
      discount_cents: 0,
      cut_fee_cents: 0,
      freight_cents: 4_500,
      taxes: [],
      tax_cents: 0,
      total_cents: 520 * quantity + 4_500,
      total_mass_grams: quantity * 1000,
      longest_lead_days: 2,
      cost_per_kg_cents: 520,
    },
  };
}

function renderBrowser(options: { shortlist?: LineSummary[] } = {}) {
  const browse = vi.fn(async () => ({
    ok: true as const,
    data: { items: [line({ sku: "BSA-316L-2B", name: "316L sheet" })], next_cursor: null, total: 1 },
  }));
  const compare = vi.fn(async () => ({
    ok: true as const,
    data: {
      skus: ["LMS-A36-PL06", "BSA-316L-2B"],
      rows: [
        {
          key: "price",
          label: "Your price",
          section: "Commercial",
          better: "lower" as const,
          cells: [
            { sku: "LMS-A36-PL06", value: 520, display: "$5.20", best: true },
            { sku: "BSA-316L-2B", value: 1_450, display: "$14.50", best: false },
          ],
        },
      ],
    },
  }));
  const save = vi.fn(async (_v: number, _q: number | null, lines: { quantity: number }[]) => ({
    ok: true as const,
    data: pricedQuote(lines[0]?.quantity ?? 0),
  }));
  const issue = vi.fn(async () => ({ ok: true as const, data: pricedQuote(25) }));
  const discard = vi.fn(async () => ({ ok: true as const, data: undefined }));
  const ask = vi.fn(async () => ({
    ok: true as const,
    data: {
      id: 1,
      reference: "RFQ-00001",
      created_at: 0,
      request: {
        sku: null,
        component: "",
        quantity: "",
        volume: "prototype" as const,
        environment: "indoor" as const,
        certification: "none" as const,
        tolerance: "",
        notes: "",
      },
      advice: {
        notes: [{ rule: "tolerance-unstated", text: "No tolerance was stated." }],
        missing: ["a quantity and unit"],
      },
    },
  }));

  render(
    <MarketplaceBrowser
      variantId={3}
      caseStudyId={2}
      categories={["Plate & sheet"]}
      suppliers={[{ id: "LMS", name: "Laurentide Metal Supply" }]}
      shortlist={options.shortlist ?? [line()]}
      initialLines={{
        items: [line({ sku: "BSA-316L-2B", name: "316L sheet", price_cents: 1_450 })],
        next_cursor: null,
        total: 1,
      }}
      initialQuote={null}
      validityDays={14}
      browse={browse as never}
      compare={compare as never}
      save={save as never}
      issue={issue as never}
      discard={discard as never}
      ask={ask as never}
    />,
  );
  return { browse, compare, save, issue, discard, ask };
}

// Indexing a query result is checked once here rather than asserted away at
// every call site, since the compiler treats every index as possibly absent.
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`nothing at index ${index}`);
  return item;
}

afterEach(() => vi.clearAllMocks());

describe("MarketplaceBrowser", () => {
  it("adds a material at its minimum order, not at one", async () => {
    // The minimum order is what a real order of this line has to clear, and
    // starting below it would only be corrected by the server a moment later.
    const { save } = renderBrowser();
    fireEvent.click(at(screen.getAllByRole("button", { name: "Add to quote" }), 0));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(3, null, [
        { sku: "LMS-A36-PL06", quantity: 25, cut_to_length: false, cut_count: 1 },
      ]),
    );
  });

  it("sends quantities and never prices", async () => {
    const { save } = renderBrowser();
    fireEvent.click(at(screen.getAllByRole("button", { name: "Add to quote" }), 0));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const [, , lines] = at(save.mock.calls, 0) as [number, number | null, object[]];
    expect(Object.keys(at(lines, 0)).sort()).toEqual([
      "cut_count",
      "cut_to_length",
      "quantity",
      "sku",
    ]);
  });

  it("shows the server's price for the basket, not one it worked out", async () => {
    renderBrowser();
    fireEvent.click(at(screen.getAllByRole("button", { name: "Add to quote" }), 0));
    // 25 kg at $5.20 is $130.00 of goods, and the server said so.
    expect((await screen.findAllByText("$130.00")).length).toBeGreaterThan(0);
    expect(screen.getByText("$175.00")).toBeDefined();
  });

  it("will not add the same line twice", async () => {
    renderBrowser();
    const add = at(screen.getAllByRole("button", { name: "Add to quote" }), 0);
    fireEvent.click(add);
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "In your quote" }).length).toBeGreaterThan(0),
    );
  });

  it("refilters through the server rather than narrowing what it already has", async () => {
    // The catalogue is the server's, and a client-side filter would quietly
    // stop at the page boundary.
    const { browse } = renderBrowser();
    const search = screen.getByLabelText("Search materials");
    fireEvent.change(search, { target: { value: "stainless" } });
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() =>
      expect(browse).toHaveBeenCalledWith(
        3,
        expect.objectContaining({ q: "stainless", cursor: 0 }),
      ),
    );
  });

  it("does not compare until there are two things to compare", async () => {
    const { compare } = renderBrowser();
    fireEvent.click(at(screen.getAllByRole("button", { name: "Compare" }), 0));
    await waitFor(() => expect(compare).not.toHaveBeenCalled());
  });

  it("marks the server's best cell, in text as well as in weight", async () => {
    const { compare } = renderBrowser();
    const buttons = screen.getAllByRole("button", { name: "Compare" });
    fireEvent.click(at(buttons, 0));
    fireEvent.click(at(buttons, 1));
    await waitFor(() => expect(compare).toHaveBeenCalledWith(3, expect.any(Array)));
    expect(await screen.findByText("$5.20")).toBeDefined();
    expect(screen.getByText("(best)")).toBeDefined();
  });

  it("says the advice is authored rules rather than a model", async () => {
    renderBrowser();
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText("No tolerance was stated.")).toBeDefined();
    expect(
      screen.getByText(
        "These notes come from the catalogue's own application-engineering rules, not from a model.",
      ),
    ).toBeDefined();
    expect(screen.getByText("a quantity and unit")).toBeDefined();
  });
});
