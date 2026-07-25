import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/lib/api/client";
import type { SaveSpecResult } from "@/lib/api/params";
import { ParamPanel } from "./param-panel";

function renderPanel(
  initial: Schemas["ParamSpec"] | null,
  saveResult: SaveSpecResult = { ok: initial ?? { parameters: {}, invariants: [] } },
) {
  const save = vi.fn(async () => saveResult);
  const clear = vi.fn(async () => true);
  const propose = vi.fn(async () => ({
    proposal_id: 1,
    spec: {
      parameters: { discount_rate: { type: "number", base: 0.08, range: [0.04, 0.12] } },
      invariants: ["NPV positive"],
      solution_method: null,
    },
    annotations: {
      discount_rate: { rationale: "It drives the discounting.", literal: "0.08", positions: [[12, 16]] },
    },
    invariant_rationales: ["Keeps the decision from flipping."],
    frozen: [],
    provenance: { model_id: "m", prompt_version: "auto-parameterize/v1" },
  }));
  render(
    <ParamPanel
      courseId={1}
      caseStudyId={2}
      body="The rate is 0.08 in the base."
      initial={initial}
      save={save as never}
      clear={clear as never}
      propose={propose as never}
      makeId={() => "key-1"}
    />,
  );
  return { save, clear, propose };
}

afterEach(() => vi.clearAllMocks());

describe("ParamPanel", () => {
  it("shows the empty state with no parameters", () => {
    renderPanel(null);
    expect(
      screen.getByText("No parameters yet. Add one, or let auto-parameterize propose a set."),
    ).toBeDefined();
  });

  it("adds a parameter and saves it into the spec", async () => {
    const { save } = renderPanel(null);
    fireEvent.click(screen.getByRole("button", { name: "Add a parameter" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "rate" } });
    fireEvent.click(screen.getByRole("button", { name: "Save parameters" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        1,
        2,
        expect.objectContaining({
          parameters: { rate: { type: "number", base: 0, range: [0, 1], step: null } },
        }),
      ),
    );
    expect(await screen.findByText("Parameters saved.")).toBeDefined();
  });

  it("surfaces the frozen-check block and the escape hatches", async () => {
    const { save } = renderPanel(
      { parameters: { resistance: { type: "number", base: 4.7, range: [1, 10] } }, invariants: [] },
      {
        blocked: [
          { parameter: "resistance", figure_id: 3, value: "4.7 kΩ", reason: "4.7 kΩ appears in Figure 2." },
        ],
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save parameters" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(await screen.findByText("4.7 kΩ appears in Figure 2.")).toBeDefined();
    expect(
      screen.getByText(/mark that figure decorative on the import review/),
    ).toBeDefined();
  });

  it("reviews an auto-parameterize proposal, then accepts it into the form", async () => {
    const { propose } = renderPanel(null);
    fireEvent.click(screen.getByRole("button", { name: "Auto-parameterize" }));
    await waitFor(() => expect(propose).toHaveBeenCalledWith(1, 2, "key-1"));
    // The overlay reviews first: the rationale and the highlighted literal show.
    expect(await screen.findByText("It drives the discounting.")).toBeDefined();
    expect(screen.getByText("0.08")).toBeDefined();
    // Nothing is in the form until accepted.
    expect(screen.queryByDisplayValue("discount_rate")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Accept these" }));
    expect(await screen.findByDisplayValue("discount_rate")).toBeDefined();
    expect(screen.getByDisplayValue("NPV positive")).toBeDefined();
  });
});
