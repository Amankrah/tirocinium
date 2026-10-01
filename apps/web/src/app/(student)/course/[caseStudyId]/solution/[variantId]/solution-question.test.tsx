import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SolutionQuestion } from "./solution-question";

describe("the question on the worked solution", () => {
  it("shows the problem the steps answer, typeset", () => {
    const { container } = render(
      <SolutionQuestion
        title="Approximate density of a Ti-6Al-4V alloy"
        body={"Determine the density of an alloy with $90\\ \\mathrm{wt\\%}$ Ti."}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "The problem" })).toBeTruthy();
    expect(screen.getByText("Approximate density of a Ti-6Al-4V alloy")).toBeTruthy();
    expect(screen.getByText(/Determine the density/)).toBeTruthy();
    expect(container.querySelector(".katex")).not.toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("still names the section when the case study title is missing", () => {
    render(<SolutionQuestion title={null} body="Determine the density." />);
    expect(screen.getByRole("heading", { level: 2, name: "The problem" })).toBeTruthy();
    expect(screen.getByText("Determine the density.")).toBeTruthy();
  });
});
