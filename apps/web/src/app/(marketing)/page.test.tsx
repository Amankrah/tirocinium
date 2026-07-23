import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { strings } from "./strings";
import LandingPage from "./page";

// The landing placeholder: wordmark and tagline, nothing else, all copy from
// the typed strings module (guide 3.4: strings live in strings.ts per route
// group from day one). The real hero arrives in Phase 2.2.
describe("landing placeholder", () => {
  it("renders the wordmark as the page heading", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Tirocinium");
  });

  it("renders the tagline from the strings module", () => {
    render(<LandingPage />);
    expect(strings.tagline).toBe("Every problem, freshly ruled.");
    expect(screen.getByText(strings.tagline)).toBeDefined();
  });
});
