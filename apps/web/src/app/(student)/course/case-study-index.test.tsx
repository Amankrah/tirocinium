import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { strings } from "../strings";
import { CaseStudyIndex } from "./case-study-index";
import { buildIndexView, PAGE_SIZE } from "./index-view";

function summary(over: Partial<{
  id: number;
  title: string;
  concepts: { concept_id: number; name: string; weight: number }[];
}> = {}) {
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

const structure = { concept_id: 1, name: "Structure of crystalline solids", weight: 1 };
const imperfections = { concept_id: 2, name: "Imperfections in solids", weight: 1 };

describe("CaseStudyIndex", () => {
  it("lists each problem once, under its topic, with a link", () => {
    render(
      <CaseStudyIndex
        view={buildIndexView(
          [
            summary({ id: 1, title: "Palladium", concepts: [structure] }),
            summary({
              id: 2,
              title: "Lithium",
              concepts: [imperfections, { concept_id: 9, name: "Alloys", weight: 0.2 }],
            }),
          ],
          {},
        )}
      />,
    );
    expect(screen.getByRole("link", { name: "Palladium" }).getAttribute("href")).toBe(
      "/course/1",
    );
    expect(screen.getByRole("heading", { name: "Structure of crystalline solids" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Imperfections in solids" })).toBeDefined();
    expect(screen.getByRole("link", { name: /Lithium/ }).textContent).toContain("Also Alloys");
    expect(screen.queryByText("Not attempted yet")).toBeNull();
    expect(screen.getByText("2 problems")).toBeDefined();
  });

  it("labels an untagged problem so it does not look like the topic above it", () => {
    render(
      <CaseStudyIndex
        view={buildIndexView(
          [
            summary({ id: 1, title: "Palladium", concepts: [structure] }),
            summary({ id: 2, title: "Untitled exercise", concepts: [] }),
          ],
          {},
        )}
      />,
    );
    expect(screen.getByRole("heading", { name: strings.course.noTopic })).toBeDefined();
    expect(screen.getByRole("link", { name: "Untitled exercise" })).toBeDefined();
  });

  it("shows the empty state when nothing is published", () => {
    render(<CaseStudyIndex view={buildIndexView([], {})} />);
    expect(screen.getByText(strings.course.empty)).toBeDefined();
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("offers the next page and hides a problem that belongs on it", () => {
    const items = Array.from({ length: PAGE_SIZE + 1 }, (_, index) =>
      summary({
        id: index + 1,
        title: `Problem ${index + 1}`,
        concepts: [structure],
      }),
    );
    render(<CaseStudyIndex view={buildIndexView(items, {})} />);
    expect(screen.queryByRole("link", { name: `Problem ${PAGE_SIZE + 1}` })).toBeNull();
    expect(screen.getByRole("link", { name: strings.course.next }).getAttribute("href")).toBe(
      "/course?page=2",
    );
    expect(screen.queryByRole("link", { name: strings.course.previous })).toBeNull();
    expect(screen.getByText(`1 to ${PAGE_SIZE} of ${PAGE_SIZE + 1}`)).toBeDefined();
  });

  it("links a topic without losing the search, and marks the current one", () => {
    render(
      <CaseStudyIndex
        view={buildIndexView(
          [
            summary({ id: 1, title: "Palladium", concepts: [structure] }),
            summary({ id: 2, title: "Vacancies", concepts: [imperfections] }),
          ],
          { q: "a" },
        )}
      />,
    );
    const topic = screen.getByRole("link", { name: /Imperfections in solids/ });
    expect(topic.getAttribute("href")).toBe("/course?q=a&topic=2");
    expect(topic.getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: /All topics/ }).getAttribute("aria-current")).toBe(
      "true",
    );
    expect(screen.getByRole("link", { name: strings.course.clearSearch }).getAttribute("href")).toBe(
      "/course",
    );
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("a");
  });

  it("says when nothing matched, and keeps the topics so another one is a click away", () => {
    render(
      <CaseStudyIndex
        view={buildIndexView(
          [
            summary({ id: 1, title: "Palladium", concepts: [structure] }),
            summary({ id: 2, title: "Vacancies", concepts: [imperfections] }),
          ],
          { q: "missing" },
        )}
      />,
    );
    expect(screen.getByText(strings.course.noMatches)).toBeDefined();
    expect(screen.queryByRole("navigation", { name: strings.course.pagination })).toBeNull();
  });
});
