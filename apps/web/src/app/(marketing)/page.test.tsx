import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { strings } from "./strings";
import LandingPage from "./page";

// The landing: wordmark, tagline, and the single Roman-story line (guide 3.1),
// all copy from the typed strings module (guide 3.4: strings live in strings.ts
// per route group from day one). The signature particle hero ships last (build
// order item 6).
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
    expect(screen.getByText(strings.story)).toBeDefined();
  });

  it("offers the two doors in a header", () => {
    render(<LandingPage />);
    const header = screen.getByRole("banner");
    const enter = screen.getByRole("link", { name: strings.enterCourse });
    const signIn = screen.getByRole("link", { name: strings.signIn });
    expect(header.contains(enter)).toBe(true);
    expect(header.contains(signIn)).toBe(true);
    expect(header.className).toContain("justify-center");
    expect(enter.getAttribute("href")).toBe("/enter");
    expect(signIn.getAttribute("href")).toBe("/sign-in");
    expect(enter.className).toContain("rounded-md");
    expect(signIn.className).toContain("bg-accent");
  });
});
