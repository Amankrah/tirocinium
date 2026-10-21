import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StudentShell } from "./student-shell";
import { strings } from "./strings";

// Guide 4.0: the seat number stays quietly present in the shell, and nothing
// else about identity ever does (students are pseudonymous seats).
describe("StudentShell", () => {
  it("keeps the wordmark and the seat number present around its content", () => {
    render(
      <StudentShell seatNumber="S-014">
        <p>course content</p>
      </StudentShell>,
    );
    expect(screen.getByText(strings.shell.wordmark)).toBeDefined();
    expect(screen.getByText(strings.shell.seat("S-014"))).toBeDefined();
    expect(screen.getByText("course content")).toBeDefined();
  });

  // Decision 0100: the project marketplace is one click from every student
  // page, and the header says which of the two places the student is in.
  it("links to the course and the marketplace from every page", () => {
    render(
      <StudentShell seatNumber="S-014">
        <p>course content</p>
      </StudentShell>,
    );
    const nav = screen.getByRole("navigation", { name: strings.shell.nav });
    const course = within(nav).getByRole("link", { name: strings.shell.course });
    const market = within(nav).getByRole("link", { name: strings.shell.marketplace });
    expect(course.getAttribute("href")).toBe("/course");
    expect(market.getAttribute("href")).toBe("/marketplace");
    // Every page but the marketplace is part of the course.
    expect(course.getAttribute("aria-current")).toBe("page");
    expect(market.getAttribute("aria-current")).toBeNull();
  });

  it("marks the marketplace as the current page when the student is in it", () => {
    render(
      <StudentShell seatNumber="S-014" section="marketplace">
        <p>marketplace</p>
      </StudentShell>,
    );
    const nav = screen.getByRole("navigation", { name: strings.shell.nav });
    expect(
      within(nav).getByRole("link", { name: strings.shell.marketplace }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      within(nav).getByRole("link", { name: strings.shell.course }).getAttribute("aria-current"),
    ).toBeNull();
  });
});
