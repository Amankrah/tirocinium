import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { strings } from "./strings";
import LandingPage from "./page";

// The landing thinned to one decision (decisions 0073 and 0075): a sticky
// header carries the wordmark and the two quiet ways in, the hero asks one
// thing with the professor's path a single quiet line, and the sections below
// state the product honestly for each audience. All copy comes from the typed
// strings module (guide 3.4).
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

  it("keeps the two quiet ways in inside a sticky header", () => {
    render(<LandingPage />);
    const header = screen.getByRole("banner");
    expect(header.className).toContain("sticky");
    const nav = within(header).getByRole("navigation", { name: strings.doors });
    const enter = within(nav).getByRole("link", { name: strings.enterCourse });
    const signIn = within(nav).getByRole("link", { name: strings.signIn });
    expect(enter.getAttribute("href")).toBe("/enter");
    expect(signIn.getAttribute("href")).toBe("/sign-in");
  });

  it("asks one thing in the hero, with the professor's path a quiet line", () => {
    render(<LandingPage />);
    const main = screen.getByRole("main");
    const enters = within(main).getAllByRole("link", { name: strings.enterCourse });
    // Hero and closing only: the hero holds a single primary action.
    expect(enters).toHaveLength(2);
    const hero = enters[0] as HTMLElement;
    expect(hero.className).toContain("bg-accent");
    expect(within(main).getByText(strings.teachLine)).toBeDefined();
    const signUps = within(main).getAllByRole("link", { name: strings.signUp });
    // The hero's quiet line and the professor section's action.
    expect(signUps).toHaveLength(2);
    for (const link of signUps) {
      expect(link.getAttribute("href")).toBe("/sign-up");
      expect(link.className).not.toContain("bg-accent");
    }
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
    // Header, hero, closing; header and closing.
    expect(enters).toHaveLength(3);
    expect(signIns).toHaveLength(2);
    for (const link of enters) expect(link.getAttribute("href")).toBe("/enter");
    for (const link of signIns) expect(link.getAttribute("href")).toBe("/sign-in");
  });
});
