import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type {
  Challenge,
  Matrix,
  ProjectQuotation,
  QuoteLine,
  Result,
  SelectionRequest,
} from "@/lib/api/marketplace";
import { ChallengeWork } from "./challenge-work";
import { MarketProvider, useMarket } from "./market-state";

// Seeds the tray and the basket through the provider's own verbs, as the
// browsing pages would, so the island under test reads them the real way.
function Seed({ tray, basket }: { tray: string[]; basket: QuoteLine[] }) {
  const market = useMarket();
  useEffect(() => {
    if (tray.length > 0) market.setTray(tray);
    if (basket.length > 0) {
      market.addMany(basket.map((line) => ({ sku: line.sku, moq: line.quantity, name: line.sku })));
    }
    // Once, on mount: the seed stands for what the student did before arriving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// The work on a challenge (decision 0112). What these hold to account: the
// candidates are the comparison tray and the quote is the basket, so nothing
// is chosen twice; every weight change is scored on the server and the
// figures shown are the server's; the commit sends candidates, weights and
// the basket lines together, with no price in it; and until all three exist
// the commit is withheld and the page says what is missing.

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
}));

const criteria = [
  { key: "cost", label: "Cost per kg", group: "cost", better: "lower" },
  { key: "corrosion", label: "Corrosion resistance", group: "durability", better: "higher" },
];

const challenge: Challenge = {
  key: "brief:bree-216:brief-01",
  source: "catalogue",
  title: "Plough blade",
  context: "A share.",
  requirements: [{ text: "Resist wear", target: "a season" }],
  constraints: [],
  deliverable: "A selection.",
  weights: { cost: 3 },
  criteria,
  selection: null,
  reveal: null,
};

function matrix(skus: string[], weights: Record<string, number>): Matrix {
  return {
    skus,
    weights,
    criteria: Object.entries(weights).map(([key, weight]) => ({
      key,
      label: key,
      group: "cost",
      better: "lower",
      weight,
      cells: skus.map((sku, index) => ({
        sku,
        value: index,
        display: `$${index}.00`,
        normalised: index === 0 ? 1 : 0,
        weighted: index === 0 ? weight : 0,
      })),
    })),
    scores: skus.map((sku, index) => ({
      sku,
      score: index === 0 ? 100 : 0,
      rank: index + 1,
      missing: [],
    })),
  };
}

function priced(lines: QuoteLine[]): ProjectQuotation {
  return {
    reference: "BREE-P-1",
    catalogue_id: "bree-216",
    catalogue_version: 4,
    prepared_at: 0,
    valid_until: 0,
    lines: lines.map((line, index) => ({
      position: index + 1,
      sku: line.sku,
      supplier_id: "LMS",
      supplier_name: "LMS",
      name: line.sku,
      spec: "",
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
      mass_grams: 1000 * line.quantity,
      lead_days: 2,
      carbon_grams: null,
      energy_mj: null,
    })),
    totals: {
      line_count: lines.length,
      supplier_count: 1,
      goods_cents: 20800,
      discount_cents: 0,
      cut_fee_cents: 0,
      freight_cents: 7900,
      taxes: [],
      tax_cents: 0,
      total_cents: 28700,
      total_mass_grams: 40000,
      longest_lead_days: 2,
      cost_per_kg_cents: 520,
      carbon_grams: null,
      freight_carbon_grams: null,
      energy_mj: null,
    },
    notices: [],
  } as unknown as ProjectQuotation;
}

function renderWork(initialTray: string[] = [], initialBasket: QuoteLine[] = []) {
  const score = vi.fn(async (skus: string[], weights: Record<string, number>) => ({
    ok: true as const,
    data: matrix(skus, weights),
  }));
  const commit = vi.fn(
    async (key: string, request: SelectionRequest) =>
      ({
        ok: true as const,
        data: {
          ...challenge,
          selection: {
            id: 1,
            reference: "BREE-SEL-ABC123",
            candidates: request.candidates,
            weights: request.weights ?? {},
            matrix: matrix(request.candidates, request.weights ?? {}),
            lines: [],
            totals: priced(request.lines).totals,
            notices: [],
            committed_at: 1,
            first_committed_at: 1,
          },
          reveal: null,
        },
      }) as Result<Challenge>,
  );
  const price = vi.fn(async (lines: QuoteLine[]) => ({ ok: true as const, data: priced(lines) }));
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <MarketProvider price={price}>
      <Seed tray={initialTray} basket={initialBasket} />
      {children}
    </MarketProvider>
  );
  render(<ChallengeWork challenge={challenge} score={score} commit={commit} />, { wrapper: Wrapper });
  return { score, commit };
}

describe("working a challenge", () => {
  it("withholds the commit and says what is missing while the tray is short", () => {
    renderWork();
    expect(screen.getByRole("button", { name: /Commit this selection/ })).toHaveProperty("disabled", true);
    expect(screen.getAllByText(/Nothing in the comparison tray yet/).length).toBeGreaterThan(0);
    expect(screen.getByText(/A selection needs two to five candidates/)).toBeDefined();
  });

  it("scores the tray on the server under the author's starting weights and again when a weight moves", async () => {
    const { score } = renderWork(["LMS-A36-PL06", "BSA-316L-2B"]);
    await waitFor(() =>
      expect(score).toHaveBeenCalledWith(["LMS-A36-PL06", "BSA-316L-2B"], { cost: 3 }),
    );
    const table = await screen.findByRole("table");
    expect(within(table).getByText("100 %")).toBeDefined();
    expect(within(table).getByText("Rank 2")).toBeDefined();

    fireEvent.change(screen.getByLabelText("Weight for Corrosion resistance"), {
      target: { value: "5" },
    });
    await waitFor(() =>
      expect(score).toHaveBeenLastCalledWith(["LMS-A36-PL06", "BSA-316L-2B"], {
        cost: 3,
        corrosion: 5,
      }),
    );
  });

  it("commits candidates, weights and the basket together, with no price, then refreshes", async () => {
    const { commit } = renderWork(
      ["LMS-A36-PL06", "BSA-316L-2B"],
      [{ sku: "LMS-A36-PL06", quantity: 40, cut_to_length: false, cut_count: 1 }],
    );
    await screen.findByRole("table");
    const button = screen.getByRole("button", { name: /Commit this selection/ });
    await waitFor(() => expect(button).toHaveProperty("disabled", false));
    fireEvent.click(button);
    await waitFor(() =>
      expect(commit).toHaveBeenCalledWith("brief:bree-216:brief-01", {
        candidates: ["LMS-A36-PL06", "BSA-316L-2B"],
        weights: { cost: 3 },
        lines: [{ sku: "LMS-A36-PL06", quantity: 40, cut_to_length: false, cut_count: 1 }],
      }),
    );
    expect(JSON.stringify(commit.mock.calls[0]![1])).not.toMatch(/price|cents/);
    expect(await screen.findByText(/Committed as BREE-SEL-ABC123/)).toBeDefined();
    expect(refresh).toHaveBeenCalled();
  });
});
