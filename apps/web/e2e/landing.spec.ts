import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "./axe";

// The marketing landing: wordmark, tagline, the Roman line, and two quiet
// doors in the header (decision 0065). It runs on both viewports via the
// config's projects.
test.describe("landing", () => {
  test("shows the wordmark and tagline", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Tirocinium" })).toBeVisible();
    await expect(page.getByText("Every problem, freshly ruled.")).toBeVisible();
  });

  test("the two doors reach enter and sign-in", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Enter course" }).click();
    await expect(page).toHaveURL(/\/enter$/);
    await page.goto("/");
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("has no accessibility violations", async ({ page }) => {
    await page.goto("/");
    await expectNoA11yViolations(page);
  });
});
