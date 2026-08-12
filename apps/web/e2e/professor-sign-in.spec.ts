import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "./axe";

// Backend guide 7.1: sign-in failure is one generic line. With no backend
// reachable, any credential fails, which surfaces that same line.
const FAILURE = "Email or password is incorrect.";

test.describe("professor sign-in", () => {
  test("shows the two fields and the single action", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("credentials that cannot sign in show the one line", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("prof@uni.edu");
    await page.getByLabel("Password").fill("wrongpass12");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("status")).toHaveText(FAILURE);
  });

  test("has no accessibility violations", async ({ page }) => {
    await page.goto("/sign-in");
    await expectNoA11yViolations(page);
  });

  test("create an account reaches sign-up", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("link", { name: "Create an account" }).click();
    await expect(page).toHaveURL(/\/sign-up$/);
  });
});
