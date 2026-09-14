import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AuthoringCatalogue,
  AuthoringLine,
} from "@/lib/api/marketplace-authoring";
import { ShortlistEditor } from "./shortlist-editor";

// The shortlist editor (Phase 10, decision 0062). What these hold to account:
// the order the professor sets is the order that is saved, filtering the
// catalogue never touches the shortlist itself, and no student's struck price
// appears on a professor surface.

function line(overrides: Partial<AuthoringLine> = {}): AuthoringLine {
  return {
    sku: "LMS-A36-PL06",
    supplier_id: "LMS",
    supplier_name: "Laurentide Metal Supply",
    category: "Plate & sheet",
    name: "ASTM A36 plate",
    spec: "6 mm",
    unit_label: "kg",
    list_price_cents: 520,
    band_low_cents: 470,
    band_high_cents: 570,
    volatility: 0.1,
    tags: ["weldable"],
    service: false,
    shortlisted: false,
    ...overrides,
  };
}

const STAINLESS = line({
  sku: "BSA-316L-2B",
  supplier_id: "BSA",
  supplier_name: "Boreal Stainless",
  name: "316L sheet",
  category: "Plate & sheet",
  list_price_cents: 1_450,
  band_low_cents: 1_300,
  band_high_cents: 1_600,
  tags: ["corrosion"],
});

const SHOP = line({
  sku: "SVC-SHOP-HR",
  supplier_id: "LMS",
  supplier_name: "Laurentide Metal Supply",
  name: "Shop time",
  category: "Services",
  unit_label: "hour",
  list_price_cents: 9_500,
  band_low_cents: 9_500,
  band_high_cents: 9_500,
  volatility: 0,
  service: true,
  tags: [],
});

// Only the id and the name are read here; the rest of a supplier is the
// directory copy the student surface renders.
function supplier(id: string, name: string): AuthoringCatalogue["suppliers"][number] {
  return {
    id,
    name,
    tagline: "",
    blurb: "",
    city: "",
    categories: [],
    established: 1990,
    glyph: "",
    minimum_order_note: "",
    policy: "",
    rating: 4,
    review_count: 0,
    shipping: "",
  };
}

function catalogue(): AuthoringCatalogue {
  return {
    id: "bree-216",
    version: 1,
    title: "BREE 216 materials",
    suppliers: [
      supplier("LMS", "Laurentide Metal Supply"),
      supplier("BSA", "Boreal Stainless"),
    ],
    categories: ["Plate & sheet", "Services"],
    briefs: [],
    lines: [line(), STAINLESS, SHOP],
  };
}

function renderEditor(initial: string[] = []) {
  const save = vi.fn(async (_c: number, _cs: number, skus: string[]) => ({
    ok: true as const,
    data: { case_study_id: 2, skus, dropped: [] },
  }));
  render(
    <ShortlistEditor
      courseId={1}
      caseStudyId={2}
      catalogue={catalogue()}
      initial={initial}
      save={save as never}
    />,
  );
  return { save };
}

// A chosen line and its catalogue card carry the same name, so every assertion
// about one or the other says which it means.
const chosenSection = () => screen.getByRole("region", { name: "Shortlisted" });
const catalogueSection = () => screen.getByRole("region", { name: "Catalogue" });

afterEach(() => vi.clearAllMocks());

describe("ShortlistEditor", () => {
  it("saves the shortlist in the order it is shown", async () => {
    // Order is the whole meaning of a shortlist: the first line is the one a
    // student meets first, so an alphabetical save would quietly lose the
    // professor's judgement.
    const { save } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Add: 316L sheet" }));
    fireEvent.click(screen.getByRole("button", { name: "Add: ASTM A36 plate" }));
    fireEvent.click(screen.getByRole("button", { name: "Save shortlist" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(1, 2, ["BSA-316L-2B", "LMS-A36-PL06"]),
    );
  });

  it("moves a line up and saves the new order", async () => {
    const { save } = renderEditor(["LMS-A36-PL06", "BSA-316L-2B"]);
    fireEvent.click(screen.getByRole("button", { name: "Move up: 316L sheet" }));
    fireEvent.click(screen.getByRole("button", { name: "Save shortlist" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(1, 2, ["BSA-316L-2B", "LMS-A36-PL06"]),
    );
  });

  it("cannot move the first line up or the last line down", () => {
    renderEditor(["LMS-A36-PL06", "BSA-316L-2B"]);
    expect(
      screen.getByRole("button", { name: "Move up: ASTM A36 plate" }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("button", { name: "Move down: 316L sheet" }),
    ).toHaveProperty("disabled", true);
  });

  it("keeps the shortlist whole while the catalogue below it is filtered", async () => {
    // Filtering is a view of the catalogue, not an edit of the shortlist. A
    // filter that dropped a chosen line would lose work silently.
    const { save } = renderEditor(["SVC-SHOP-HR"]);
    fireEvent.change(screen.getByLabelText("Search the catalogue"), {
      target: { value: "stainless" },
    });
    expect(within(catalogueSection()).queryByText("Shop time")).toBeNull();
    expect(within(chosenSection()).getByText("Shop time")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Save shortlist" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(1, 2, ["SVC-SHOP-HR"]));
  });

  it("narrows by supplier", () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText("Every supplier"), {
      target: { value: "BSA" },
    });
    const catalogue = within(catalogueSection());
    expect(catalogue.getByText("316L sheet")).toBeDefined();
    expect(catalogue.queryByText("ASTM A36 plate")).toBeNull();
  });

  it("shows a list price and the band, never a student's price", () => {
    // A professor who could read one seat's struck price could read them all,
    // and per-variant pricing would stop meaning anything.
    renderEditor();
    expect(screen.getByText("$5.20 list per kg")).toBeDefined();
    expect(screen.getByText("Students see $4.70 to $5.70")).toBeDefined();
  });

  it("calls a line with no spread steady rather than quoting a range", () => {
    renderEditor();
    expect(screen.getByText("Steady price")).toBeDefined();
  });

  it("will not shortlist the same line twice", () => {
    renderEditor(["LMS-A36-PL06"]);
    expect(
      screen.getByRole("button", { name: "Shortlisted: ASTM A36 plate" }),
    ).toHaveProperty("disabled", true);
  });

  it("says which lines this catalogue version dropped", async () => {
    const save = vi.fn(async () => ({
      ok: true as const,
      data: {
        case_study_id: 2,
        skus: ["LMS-A36-PL06"],
        dropped: ["LMS-GONE-01"],
      },
    }));
    render(
      <ShortlistEditor
        courseId={1}
        caseStudyId={2}
        catalogue={catalogue()}
        initial={["LMS-A36-PL06", "LMS-GONE-01"]}
        save={save as never}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save shortlist" }));
    expect(
      await screen.findByText(
        "This catalogue version no longer carries LMS-GONE-01, so those lines were dropped.",
      ),
    ).toBeDefined();
  });

  it("says so when the save does not go through", async () => {
    const save = vi.fn(async () => ({
      ok: false as const,
      status: 409,
      detail: "",
    }));
    render(
      <ShortlistEditor
        courseId={1}
        caseStudyId={2}
        catalogue={catalogue()}
        initial={[]}
        save={save as never}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save shortlist" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "That did not save. Try again.",
    );
  });
});
