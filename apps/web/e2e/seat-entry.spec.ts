import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "./axe";

// Guide 4.0: one screen, one action, one honest failure line. With no backend
// reachable, a well-formed code still cannot redeem, which is exactly the
// student-facing failure the copy describes, so it exercises the real path.
const FAILURE =
  "That code did not work. Check it against the card from your professor.";

test.describe("seat entry", () => {
  test("shows the field and the single action, nothing else", async ({ page }) => {
    await page.goto("/enter");
    await expect(page.getByLabel("Course code")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enter course" })).toBeVisible();
    await expect(page.getByText(FAILURE)).toHaveCount(0);
  });

  test("a code that cannot redeem shows the one honest line", async ({ page }) => {
    await page.goto("/enter");
    await page.getByLabel("Course code").fill("MK4T9RWFC2HPX6ZD");
    await page.getByRole("button", { name: "Enter course" }).click();
    await expect(page.getByRole("status")).toHaveText(FAILURE);
  });

  test("has no accessibility violations", async ({ page }) => {
    await page.goto("/enter");
    await expectNoA11yViolations(page);
  });
});
