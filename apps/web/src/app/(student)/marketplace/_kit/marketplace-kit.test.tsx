import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  Comparison,
  LineSummary,
  ProjectQuotation,
  QuoteLine,
  RfqRequest,
} from "@/lib/api/marketplace";
import { CompareView, comparisonAsTable } from "./compare-view";
import { CompareTray, LineActions } from "./controls";
import { Filters, list, sortOf } from "./filters";
import { MarketProvider, TRAY_LIMIT, useMarket } from "./market-state";
import { dataSheet } from "./properties";
import { QuoteView, asTable } from "./quote-view";
import { RequestView } from "./request-view";

// The project marketplace's working parts (decision 0101). What these hold to
// account: the client sends quantities and never prices; the basket and the
// tray survive between the pieces that share them; the tray holds five; the
// quotation's rows are the server's and add up; what is copied is what is
// shown; and the request form collects no person.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

function summary(sku: string, overrides: Partial<LineSummary> = {}): LineSummary {
  return {
    sku,
    supplier_id: "LMS",
    supplier_name: "Laurentian Metal Supply",
    category: "Plate & sheet",
    name: `Line ${sku}`,
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
    tags: [],
    service: false,
    shortlisted: false,
    ...overrides,
  };
}

function priced(lines: QuoteLine[]): ProjectQuotation {
  const goods = lines.reduce((sum, line) => sum + 520 * line.quantity, 0);
  return {
    reference: "BREE-P-20261021-ABC123",
    catalogue_id: "bree-216",
    catalogue_version: 1,
    prepared_at: 1_792_540_800,
    valid_until: 1_792_540_800 + 14 * 86_400,
    notices: [],
    lines: lines.map((line, index) => ({
      position: index + 1,
      sku: line.sku,
      supplier_id: "LMS",
      supplier_name: "Laurentian Metal Supply",
      name: `Line ${line.sku}`,
      spec: "6 mm",
      unit: "kg",
      unit_label: "kg",
      requested_quantity: line.quantity,
      quantity: line.quantity,
      list_price_cents: 520,
      unit_price_cents: 520,
      break_percent: 0,
      extended_cents: 520 * line.quantity,
      cut_to_length: false,
      cut_count: 1,
      cut_fee_cents: 0,
      mass_grams: line.quantity * 1000,
      lead_days: 2,
    })),
    totals: {
      line_count: lines.length,
      supplier_count: 1,
      goods_cents: goods,
      discount_cents: 0,
      cut_fee_cents: 0,
      freight_cents: 4_500,
      taxes: [{ code: "GST", rate: 0.05, amount_cents: 100 }],
      tax_cents: 100,
      total_cents: goods + 4_600,
      total_mass_grams: 25_000,
      longest_lead_days: 2,
      cost_per_kg_cents: 520,
    },
  };
}

function withMarket(children: ReactNode) {
  const price = vi.fn(async (lines: QuoteLine[]) => ({ ok: true as const, data: priced(lines) }));
  const utils = render(<MarketProvider price={price}>{children}</MarketProvider>);
  return { price, ...utils };
}

// A test-only handle on the shared state, for what no single control shows.
function Peek({ onReady }: { onReady: (market: ReturnType<typeof useMarket>) => void }) {
  onReady(useMarket());
  return null;
}

afterEach(() => vi.restoreAllMocks());

describe("the basket", () => {
  it("adds a line at its minimum order and sends only quantities", async () => {
    const { price } = withMarket(<LineActions line={{ sku: "A", moq: 25, name: "Line A" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Add to quote" }));
    await waitFor(() =>
      expect(price).toHaveBeenCalledWith([{ sku: "A", quantity: 25, cut_to_length: false, cut_count: 1 }]),
    );
    expect(await screen.findByRole("button", { name: "In your quote" })).toHaveProperty("disabled", true);
    const status = screen.getByRole("status");
    expect(within(status).getByText("Line A is in your quote.")).toBeDefined();
    expect(within(status).getByRole("link", { name: "View the quote" }).getAttribute("href")).toBe(
      "/marketplace/quote",
    );
  });
});

describe("the comparison tray", () => {
  it("holds five, and says so rather than dropping a sixth silently", async () => {
    let market: ReturnType<typeof useMarket> | null = null;
    withMarket(
      <>
        <Peek onReady={(value) => (market = value)} />
        <CompareTray />
      </>,
    );
    for (const sku of ["A", "B", "C", "D", "E"]) {
      act(() => market!.toggleTray(sku));
    }
    expect(market!.tray).toHaveLength(TRAY_LIMIT);
    act(() => market!.toggleTray("F"));
    expect(market!.tray).not.toContain("F");
    expect(await screen.findByText("You can compare five at a time.")).toBeDefined();

    const tray = screen.getByRole("complementary", { name: "Comparison tray" });
    fireEvent.click(within(tray).getByRole("button", { name: "Take A out of the comparison" }));
    expect(market!.tray).toEqual(["B", "C", "D", "E"]);
    expect(within(tray).getByRole("link", { name: "Comparing 4" }).getAttribute("href")).toBe(
      "/marketplace/compare",
    );
  });
});

describe("the quote page", () => {
  const view = (
    <QuoteView
      title="BREE 216 materials"
      basis="List prices from BREE 216 materials, version 1"
      currency="CAD"
      suppliers={[{ id: "LMS", name: "Laurentian Metal Supply", city: "Lachine, QC" }]}
    />
  );

  it("says an empty quote is empty and points at where to start", () => {
    withMarket(view);
    expect(screen.getByText(/Nothing quoted yet/)).toBeDefined();
    expect(screen.getByRole("link", { name: "Start from your project brief" })).toBeDefined();
  });

  it("prints a sheet whose subtotal is the server's goods figure, with its reference", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    let market: ReturnType<typeof useMarket> | null = null;
    withMarket(
      <>
        <Peek onReady={(value) => (market = value)} />
        {view}
      </>,
    );
    act(() => market!.add({ sku: "A", moq: 25, name: "Line A" }));

    const sheet = await screen.findByRole("article");
    expect(within(sheet).getByText("Quotation BREE-P-20261021-ABC123")).toBeDefined();
    expect(within(sheet).getByText("Laurentian Metal Supply, Lachine, QC")).toBeDefined();
    const subtotal = within(sheet).getByText("Subtotal, goods and services").closest("tr");
    expect(subtotal?.textContent).toContain("$130.00");
    // On paper only the sheet: the editor is hidden from the printer.
    expect(screen.getByRole("heading", { level: 1 }).closest("section")?.className).toContain(
      "print:hidden",
    );

    const button = screen.getByRole("button", { name: "Print or save as PDF" });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    fireEvent.click(button);
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("copies the same figures it shows, as a table", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    let market: ReturnType<typeof useMarket> | null = null;
    withMarket(
      <>
        <Peek onReady={(value) => (market = value)} />
        {view}
      </>,
    );
    act(() => market!.add({ sku: "A", moq: 25, name: "Line A" }));
    const button = await screen.findByRole("button", { name: "Copy as a table" });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = writeText.mock.calls[0]![0];
    expect(text).toBe(asTable(priced([{ sku: "A", quantity: 25, cut_to_length: false, cut_count: 1 }]), "CAD"));
    expect(text).toContain("A\tLine A, 6 mm\t25\tkg\t5.20\t130.00");
    expect(text).toContain("BREE-P-20261021-ABC123");
    expect(await screen.findByText(/Quotation copied/)).toBeDefined();
  });
});

describe("the comparison page", () => {
  const table: Comparison = {
    skus: ["A", "B"],
    rows: [
      {
        key: "price",
        label: "List price",
        section: "Commercial",
        better: "lower",
        cells: [
          { sku: "A", value: 520, display: "$5.20 / kg", best: true },
          { sku: "B", value: 985, display: "$9.85 / kg", best: false },
        ],
      },
      {
        key: "corrosion",
        label: "Corrosion resistance",
        section: "Environment",
        better: "higher",
        cells: [
          { sku: "A", value: 2, display: "★★☆☆☆", best: false },
          { sku: "B", value: 4, display: "★★★★☆", best: true },
        ],
      },
    ],
  };

  it("says what to do when the tray is empty", () => {
    withMarket(<CompareView compare={vi.fn()} browse={vi.fn()} />);
    expect(screen.getByText(/Nothing to compare yet/)).toBeDefined();
  });

  it("compares the tray and can put every candidate in the quote", async () => {
    const compare = vi.fn(async () => ({ ok: true as const, data: table }));
    const browse = vi.fn(async () => ({
      ok: true as const,
      data: { items: [summary("A"), summary("B", { moq: 10 })], next_cursor: null, total: 2 },
    }));
    let market: ReturnType<typeof useMarket> | null = null;
    const { price } = withMarket(
      <>
        <Peek onReady={(value) => (market = value)} />
        <CompareView compare={compare} browse={browse} />
      </>,
    );
    act(() => market!.setTray(["A", "B"]));
    await waitFor(() => expect(compare).toHaveBeenCalledWith(["A", "B"]));
    expect(await screen.findByText("Line A")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Add all 2 to the quote" }));
    await waitFor(() =>
      expect(price).toHaveBeenCalledWith([
        { sku: "A", quantity: 25, cut_to_length: false, cut_count: 1 },
        { sku: "B", quantity: 10, cut_to_length: false, cut_count: 1 },
      ]),
    );
  });

  it("copies the comparison with the best cells marked in words", () => {
    const text = comparisonAsTable(table, { A: "Line A", B: "Line B" });
    expect(text.split("\n")[0]).toBe("Property\tLine A (A)\tLine B (B)");
    expect(text).toContain("List price\t$5.20 / kg (best)\t$9.85 / kg");
    expect(text).toContain("Corrosion resistance\t**\t**** (best)");
  });
});

describe("the data sheet", () => {
  const empty = {
    density_kg_m3: null,
    yield_strength_mpa: null,
    tensile_strength_mpa: null,
    youngs_modulus_gpa: null,
    elongation_percent: null,
    fracture_toughness_mpa_m05: null,
    hardness: null,
    thermal_conductivity_w_mk: null,
    thermal_expansion_um_mk: null,
    max_service_temp_c: null,
    corrosion_resistance: null,
    uv_resistance: null,
    food_contact: null,
    embodied_energy_mj_kg: null,
    recyclability_percent: null,
  };

  it("leaves an absent figure off rather than printing a zero", () => {
    expect(dataSheet(empty, true)).toEqual([]);
  });

  it("reads a gap in the yield point as brittleness when there is a tensile strength", () => {
    const rows = dataSheet({ ...empty, tensile_strength_mpa: 300, density_kg_m3: 3100 }, false);
    expect(rows).toContainEqual({ label: "Yield strength", value: "None (brittle, no yield point)" });
    expect(rows).toContainEqual({ label: "Density", value: "3,100 kg/m³" });
  });

  it("writes ratings and approvals in words as well as marks", () => {
    const rows = dataSheet({ ...empty, corrosion_resistance: 3, food_contact: false }, false);
    expect(rows).toContainEqual({ label: "Corrosion resistance", value: "★★★☆☆ (3 of 5)" });
    expect(rows).toContainEqual({ label: "Food-contact approved", value: "No" });
  });
});

describe("the filter column", () => {
  it("reads repeated parameters as lists and refuses an unknown sort", () => {
    expect(list(undefined)).toEqual([]);
    expect(list("a")).toEqual(["a"]);
    expect(list(["a", "b"])).toEqual(["a", "b"]);
    expect(sortOf("yield_desc")).toBe("yield_desc");
    expect(sortOf("drop table")).toBe("relevance");
  });

  it("is a plain form that keeps what was ticked and offers a way back", () => {
    render(
      <Filters
        action="/marketplace/store/LMS"
        categories={[{ value: "Plate & sheet", count: 9 }, { value: "Bar stock", count: 4 }]}
        tags={[{ value: "weldable" }]}
        chosenCategories={["Bar stock"]}
        chosenTags={[]}
        sort="relevance"
      />,
    );
    const form = screen.getByRole("form", { name: "Filter the catalogue" });
    expect(form.getAttribute("method")).toBe("get");
    expect(screen.getByRole("checkbox", { name: /Bar stock/ })).toHaveProperty("checked", true);
    expect(screen.getByRole("checkbox", { name: /Plate & sheet/ })).toHaveProperty("checked", false);
    expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe(
      "/marketplace/store/LMS",
    );
  });
});

describe("the request for quotation", () => {
  it("asks for no person, and offers to quote the line it was asked about", async () => {
    const ask = vi.fn(async (request: RfqRequest) => ({
      ok: true as const,
      data: {
        request,
        advice: { notes: [{ rule: "r", text: "A note." }], missing: [] },
        priced: null,
        reply: null,
        source: "rules" as const,
      },
    }));
    const { price } = withMarket(<RequestView initialSku="A" line={summary("A")} ask={ask} />);
    expect(screen.queryByLabelText(/name/i)).toBeNull();
    expect(screen.queryByLabelText(/group/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(ask).toHaveBeenCalledWith(expect.objectContaining({ sku: "A" })));
    fireEvent.click(await screen.findByRole("button", { name: "Add A to the quote" }));
    await waitFor(() => expect(price).toHaveBeenCalled());
  });
});
