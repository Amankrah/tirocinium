import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/lib/api/client";
import { AutoOverlay, segmentBody } from "./auto-overlay";

describe("segmentBody", () => {
  it("splits the body into plain and highlighted spans at the positions", () => {
    const body = "The rate is 0.08 in the base.";
    const segments = segmentBody(body, {
      rate: { rationale: "", literal: "0.08", positions: [[12, 16]] },
    });
    expect(segments).toEqual([
      { text: "The rate is " },
      { text: "0.08", param: "rate" },
      { text: " in the base." },
    ]);
  });

  it("drops out-of-range or overlapping marks rather than corrupt the text", () => {
    const body = "short";
    const segments = segmentBody(body, {
      a: { rationale: "", literal: "x", positions: [[0, 3]] },
      b: { rationale: "", literal: "y", positions: [[1, 2]] }, // overlaps a
      c: { rationale: "", literal: "z", positions: [[10, 20]] }, // out of range
    });
    // The rejoined text always equals the original body.
    expect(segments.map((s) => s.text).join("")).toBe(body);
    expect(segments.some((s) => s.param === "a")).toBe(true);
    expect(segments.some((s) => s.param === "b")).toBe(false);
  });
});

describe("AutoOverlay", () => {
  const proposal: Schemas["ProposalOut"] = {
    proposal_id: 1,
    spec: {
      parameters: { rate: { type: "number", base: 0.08, range: [0.04, 0.12] } },
      invariants: ["NPV positive"],
      solution_method: null,
    },
    annotations: {
      rate: { rationale: "Drives the discounting.", literal: "0.08", positions: [[12, 16]] },
    },
    invariant_rationales: ["Keeps it from flipping."],
    frozen: [
      { parameter: "resistance", figure_id: 3, value: "4.7 kΩ", reason: "appears in Figure 2." },
    ],
    provenance: { model_id: "m", prompt_version: "auto-parameterize/v1" },
  };

  it("shows the range chip, rationale, and figure lock, and accepts", () => {
    const onAccept = vi.fn();
    render(
      <AutoOverlay
        body="The rate is 0.08 in the base."
        proposal={proposal}
        onAccept={onAccept}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("0.04 to 0.12")).toBeDefined();
    expect(screen.getByText("Drives the discounting.")).toBeDefined();
    expect(screen.getByText(/4.7 kΩ, locked to a figure/)).toBeDefined();
    screen.getByRole("button", { name: "Accept these" }).click();
    expect(onAccept).toHaveBeenCalled();
  });
});
