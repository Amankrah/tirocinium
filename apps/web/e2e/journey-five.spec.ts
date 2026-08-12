import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "./axe";

// Journey five (Phase 8 gate): grade a submission end to end. A professor signs
// in, opens the review queue, moves through it by keyboard, opens one
// submission, checks the reading against the page the model read, and grades it,
// which is the call that emits professor_grade into the mastery model.
//
// What the seed provides: the professor account (so the journey starts ready
// to sign in) and their course (E2E_PRO_EMAIL, E2E_PRO_PASSWORD, E2E_COURSE_TITLE, as
// journey one), plus at least one processed submission in that course, which
// needs a seat to have uploaded and the transcription worker to have read it.
const email = process.env.E2E_PRO_EMAIL;
const password = process.env.E2E_PRO_PASSWORD;
const courseTitle = process.env.E2E_COURSE_TITLE;

test.describe("journey five: grade a submission", () => {
  test.skip(
    !email || !password || !courseTitle,
    "needs a seeded backend with a processed submission (set E2E_PRO_EMAIL, E2E_PRO_PASSWORD, E2E_COURSE_TITLE)",
  );

  test("a professor reviews a submission and grades it", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole("link", { name: courseTitle! }).click();
    await page.getByRole("link", { name: "Review submissions" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Submissions" }),
    ).toBeVisible();

    await expectNoA11yViolations(page);

    // The queue is keyboard-driven: j moves, Enter opens (guide 4.4).
    const firstRow = page.getByRole("link").filter({ hasText: "Seat" }).first();
    await expect(firstRow).toBeVisible();
    await firstRow.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { level: 1, name: /^Seat / })).toBeVisible();
    await expectNoA11yViolations(page);

    // The rendition the model read is the default view, and the surface says so
    // rather than leaving the professor to guess which image carries the boxes
    // (decision 0059).
    await expect(
      page.getByRole("button", { name: "What the model read" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Original photo" }).click();
    await expect(page.getByRole("button", { name: "Original photo" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByLabel("Score out of 100").fill("80");
    await page.getByRole("button", { name: "Save grade" }).click();
    await expect(page.getByText("Saved 80%.")).toBeVisible({ timeout: 20_000 });

    // The grade is evidence, so it is on the queue row when we go back.
    await page.getByRole("link", { name: "Back to submissions" }).click();
    await expect(page.getByText("Graded 80%").first()).toBeVisible();
  });
});
