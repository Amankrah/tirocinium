import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MasteryLabel } from "./mastery-label";

describe("MasteryLabel", () => {
  it("never renders a label bare: it carries its evidence trail, shown verbatim", () => {
    const { container } = render(
      <MasteryLabel
        label="solid"
        trail={[
          { at: 1_700_000_000, text: "Correct final answer." },
          { at: 1_699_000_000, text: "Defended the reasoning well." },
        ]}
      />,
    );
    // The label and the always-present disclosure.
    expect(screen.getByText("Solid")).toBeDefined();
    expect(container.querySelector("summary")).not.toBeNull();
    // The trail text is the model's, shown verbatim.
    expect(screen.getByText("Correct final answer.")).toBeDefined();
    expect(screen.getByText("Defended the reasoning well.")).toBeDefined();
    expect(screen.getByText("See the evidence")).toBeDefined();
  });

  it("maps each label to its calm word", () => {
    render(<MasteryLabel label="developing" trail={[{ at: 1_700_000_000, text: "x" }]} />);
    expect(screen.getByText("Developing")).toBeDefined();
  });

  it("renders an unseen concept quietly, with no claim to expand", () => {
    const { container } = render(<MasteryLabel label="unseen" trail={[]} />);
    expect(screen.getByText("Not started")).toBeDefined();
    expect(container.querySelector("summary")).toBeNull();
  });
});
