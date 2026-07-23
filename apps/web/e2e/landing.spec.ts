import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "./axe";

// The marketing landing: wordmark and tagline only today (the particle hero is
// Phase 9.5). It runs on both viewports via the config's projects.
test.describe("landing", () => {
  test("shows the wordmark and tagline", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Tirocinium" })).toBeVisible();
    await expect(page.getByText("Every problem, freshly ruled.")).toBeVisible();
  });

  test("has no accessibility violations", async ({ page }) => {
    await page.goto("/");
    await expectNoA11yViolations(page);
  });
});
