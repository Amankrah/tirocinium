import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "./axe";

// The marketing landing, thinned to one decision (decisions 0073 and 0075):
// a sticky header with the two quiet ways in, a hero that asks one thing with
// the professor's path a single quiet line, and the honest sections below. It
// runs on both viewports via the config's projects. Door labels repeat down
// the page, so clicks take the first match in DOM order (the header's).
test.describe("landing", () => {
  test("shows the wordmark and tagline", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "Tirocinium" }),
    ).toBeVisible();
    await expect(page.getByText("Every problem, freshly ruled.")).toBeVisible();
  });

  test("the header stays while the page scrolls", async ({ page }) => {
    await page.goto("/");
    await page.mouse.wheel(0, 2400);
    const nav = page.getByRole("banner").getByRole("navigation", { name: "Ways in" });
    await expect(nav.getByRole("link", { name: "Enter course" })).toBeInViewport();
    await expect(nav.getByRole("link", { name: "Sign in" })).toBeInViewport();
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
