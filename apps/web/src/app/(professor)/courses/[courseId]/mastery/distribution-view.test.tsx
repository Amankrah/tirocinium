import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DistributionView } from "./distribution-view";

describe("DistributionView", () => {
  it("shows anonymous per-concept counts and an accessible bar", () => {
    render(
      <DistributionView
        distribution={{
          concepts: [
            { concept_id: 7, name: "Ohm's law", unseen: 12, shaky: 4, developing: 9, solid: 3, gaps: [] },
          ],
        }}
      />,
    );
    expect(screen.getByText("Ohm's law")).toBeDefined();
    expect(screen.getByText("28 seats")).toBeDefined();
    expect(screen.getByText("12 unseen")).toBeDefined();
    expect(screen.getByText("3 solid")).toBeDefined();
    // The bar carries the full breakdown as its accessible name.
    expect(
      screen.getByRole("img", { name: "12 unseen, 4 shaky, 9 developing, 3 solid" }),
    ).toBeDefined();
  });

  it("shows the empty gaps slot until defenses name them", () => {
    render(
      <DistributionView
        distribution={{
          concepts: [{ concept_id: 7, name: "Ohm's law", unseen: 1, shaky: 0, developing: 0, solid: 0, gaps: [] }],
        }}
      />,
    );
    expect(screen.getByText("Common gaps will appear here once voice defenses begin.")).toBeDefined();
  });

  it("names the gaps verbatim when present", () => {
    render(
      <DistributionView
        distribution={{
          concepts: [{ concept_id: 7, name: "Ohm's law", unseen: 0, shaky: 2, developing: 0, solid: 0, gaps: ["nominal vs real confusion"] }],
        }}
      />,
    );
    expect(screen.getByText("nominal vs real confusion")).toBeDefined();
  });

  it("shows the empty state with no concepts", () => {
    render(<DistributionView distribution={{ concepts: [] }} />);
    expect(screen.getByText("Progress will appear here as students practise.")).toBeDefined();
  });
});
