import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "./axe";

// Self-serve signup (decision 0065). With no backend reachable, the request
// fails and the recovery line is what a professor sees.
const UNAVAILABLE = "That did not work. Check your connection and try again.";

test.describe("professor sign-up", () => {
  test("shows email, password, confirm, and the single action", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Confirm password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  });

  test("a short password is refused without a round trip", async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill("prof@uni.edu");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByLabel("Confirm password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("status")).toHaveText("Use at least 10 characters.");
  });

  // The only test here that needs the backend to be down, so it runs only where
  // it is. Against the seeded backend of the `e2e` job this would create an
  // account rather than fail, assert nothing about the recovery line, and leave
  // a professor in the directory that the seed did not put there.
  test("a backend that cannot be reached shows the recovery line", async ({ page }) => {
    test.skip(
      !!process.env.E2E_PRO_EMAIL,
      "asserts what a professor sees with no backend reachable; a seeded run has one",
    );
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill("prof@uni.edu");
    await page.getByLabel("Password", { exact: true }).fill("secretpass1");
    await page.getByLabel("Confirm password").fill("secretpass1");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("status")).toHaveText(UNAVAILABLE);
  });

  test("sign in reaches the other door", async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("has no accessibility violations", async ({ page }) => {
    await page.goto("/sign-up");
    await expectNoA11yViolations(page);
  });
});
