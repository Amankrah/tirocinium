import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "./axe";

// The marketing landing as a two-door threshold (decision 0073): wordmark,
// tagline, the Roman line, the two addressed door cards in the hero, and the
// honest sections below. It runs on both viewports via the config's projects.
// The door labels repeat at the page's close, so clicks take the hero's first.
test.describe("landing", () => {
  test("shows the wordmark and tagline", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Tirocinium" })).toBeVisible();
    await expect(page.getByText("Every problem, freshly ruled.")).toBeVisible();
  });

  // Each click waits for network idle first: against next dev under parallel
  // load a click can land mid-hydration and be swallowed by the router, and
  // the target route may compile on demand, so an eager click plus the default
  // five-second expect measures the harness, not the doors (the same class of
  // trap as the axe font wait in axe.ts).
  test("the three doors reach enter, sign-in, and sign-up", async ({ page }) => {
    const navigated = { timeout: 15_000 };
    for (const [name, target] of [
      ["Enter course", /\/enter$/],
      ["Sign in", /\/sign-in$/],
      ["Create an account", /\/sign-up$/],
    ] as const) {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await page.getByRole("link", { name }).first().click();
      await expect(page).toHaveURL(target, navigated);
    }
  });

  test("states the product for both audiences", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "How practice works" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Built for your course" }),
    ).toBeVisible();
  });

  test("has no accessibility violations", async ({ page }) => {
    await page.goto("/");
    await expectNoA11yViolations(page);
  });
});
