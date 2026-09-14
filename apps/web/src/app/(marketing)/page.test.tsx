import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { strings } from "./strings";
import LandingPage from "./page";

// The landing as a two-door threshold (decision 0073): the hero holds the
// wordmark, the tagline, the single Roman-story line (guide 3.1), and the two
// addressed doors; the sections below state the product honestly for each
// audience. All copy comes from the typed strings module (guide 3.4).
describe("landing", () => {
  it("renders the wordmark as the page heading", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Tirocinium");
  });

  it("renders the tagline from the strings module", () => {
    render(<LandingPage />);
    expect(strings.tagline).toBe("Every problem, freshly ruled.");
    expect(screen.getByText(strings.tagline)).toBeDefined();
  });

  it("tells the Roman story once, from the strings module", () => {
    render(<LandingPage />);
    expect(screen.getAllByText(strings.story)).toHaveLength(1);
  });

  it("offers both audiences a door in the hero", () => {
    render(<LandingPage />);
    const doors = screen.getByRole("navigation", { name: strings.doors });
    expect(
      within(doors).getByRole("heading", { name: strings.studentDoorHeading }),
    ).toBeDefined();
    expect(
      within(doors).getByRole("heading", { name: strings.professorDoorHeading }),
    ).toBeDefined();
    const enter = within(doors).getByRole("link", { name: strings.enterCourse });
    const signIn = within(doors).getByRole("link", { name: strings.signIn });
    const signUp = within(doors).getByRole("link", { name: strings.signUp });
    expect(enter.getAttribute("href")).toBe("/enter");
    expect(signIn.getAttribute("href")).toBe("/sign-in");
    expect(signUp.getAttribute("href")).toBe("/sign-up");
    // The accent is spent on the one primary action: the student's door.
    expect(enter.className).toContain("bg-accent");
    expect(signIn.className).not.toContain("bg-accent");
  });

  it("states the practice loop in three steps", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { name: strings.practiceHeading })).toBeDefined();
    const steps = screen.getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    expect(screen.getByText(strings.practiceStep1Body)).toBeDefined();
    expect(screen.getByText(strings.practiceStep2Body)).toBeDefined();
    expect(screen.getByText(strings.practiceStep3Body)).toBeDefined();
  });

  it("owns the calm position in one line", () => {
    render(<LandingPage />);
    expect(screen.getByText(strings.calm)).toBeDefined();
  });

  it("makes the four professor claims", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { name: strings.professorHeading })).toBeDefined();
    for (const claim of [
      strings.professorImportTitle,
      strings.professorVariantsTitle,
      strings.professorSeatsTitle,
      strings.professorPictureTitle,
    ]) {
      expect(screen.getByRole("heading", { name: claim })).toBeDefined();
    }
  });

  it("repeats the two doors at the close, so entries bracket the page", () => {
    render(<LandingPage />);
    const enters = screen.getAllByRole("link", { name: strings.enterCourse });
    const signIns = screen.getAllByRole("link", { name: strings.signIn });
    expect(enters).toHaveLength(2);
    expect(signIns).toHaveLength(2);
    for (const link of enters) expect(link.getAttribute("href")).toBe("/enter");
    for (const link of signIns) expect(link.getAttribute("href")).toBe("/sign-in");
  });
});
