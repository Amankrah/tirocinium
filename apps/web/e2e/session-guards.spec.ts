import { expect, test } from "@playwright/test";

// The authenticated surfaces resolve their session server-side and send anyone
// without one back to the way in (decisions 0011, 0012). No backend needed: with
// no cookie the redirect happens before any fetch.
test.describe("session guards", () => {
  test("course home requires a seat session", async ({ page }) => {
    await page.goto("/course");
    await expect(page).toHaveURL(/\/enter$/);
  });

  test("a problem view requires a seat session", async ({ page }) => {
    await page.goto("/course/1");
    await expect(page).toHaveURL(/\/enter$/);
  });

  test("the professor dashboard requires sign-in", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in$/);
  });
});
