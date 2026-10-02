import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ dismissOnboarding: async () => {} }));

import { OnboardingPanel } from "./onboarding-panel";
import { strings } from "../strings";

// The panel is the student's first explanation of the loop (guide 4.2). What
// matters is that it says the sequence, offers the full version, and can be
// closed; the wording itself lives in strings and is reviewed there.
describe("OnboardingPanel", () => {
  it("names the four steps in order", () => {
    render(<OnboardingPanel />);

    const steps = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(steps).toHaveLength(strings.onboarding.steps.length);
    steps.forEach((item, index) => {
      expect(item.textContent).toContain(strings.onboarding.steps[index]?.title);
    });
  });

  it("offers the standing page as well as a way to close", () => {
    render(<OnboardingPanel />);

    expect(
      screen.getByRole("link", { name: strings.onboarding.pageLink }),
    ).toHaveProperty("href", expect.stringContaining("/course/how-it-works"));
    expect(
      screen.getByRole("button", { name: strings.onboarding.panelDismiss }),
    ).toBeTruthy();
  });

  // Not a dialog: a student arriving at their course came to find a problem,
  // and an explanation that has to be dismissed before the page works is an
  // obstacle. It is a labelled region they can walk past.
  it("is a labelled region rather than a modal", () => {
    render(<OnboardingPanel />);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("region", { name: strings.onboarding.panelTitle }),
    ).toBeTruthy();
  });
});
