import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { strings } from "../strings";
import { CaseStudyIndex } from "./case-study-index";

function summary(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    title: "Wheatstone bridge",
    status: "published",
    concepts: [{ concept_id: 4, name: "Kirchhoff's laws", weight: 1 }],
    created_at: 0,
    updated_at: 0,
    ...over,
  };
}

describe("CaseStudyIndex", () => {
  it("lists each case study as a link with its concept tags", () => {
    render(
      <CaseStudyIndex
        items={[
          summary(),
          summary({ id: 2, title: "RC transient", concepts: [] }),
        ]}
      />,
    );
    const link = screen.getByRole("link", { name: /Wheatstone bridge/ });
    expect(link.getAttribute("href")).toBe("/course/1");
    expect(screen.getByText("Kirchhoff's laws")).toBeDefined();
    expect(screen.getByRole("link", { name: /RC transient/ }).getAttribute("href")).toBe(
      "/course/2",
    );
  });

  it("shows the empty state when nothing is published", () => {
    render(<CaseStudyIndex items={[]} />);
    expect(screen.getByText(strings.course.empty)).toBeDefined();
  });
});
