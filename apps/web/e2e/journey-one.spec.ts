import { expect, test } from "@playwright/test";

// Journey one (Phase 2 gate): a seated student redeems a code and reads a
// published case study, rendered from the real backend on both viewports. The
// professor-authors-and-publishes half is seeded server-side for now, since the
// professor authoring UI is a later milestone; this drives the student half
// through the UI end to end. Skipped unless a seeded backend's details are in
// the environment (see the web README for the seed-and-run recipe).
const seatCode = process.env.E2E_SEAT_CODE;
const caseTitle = process.env.E2E_CASE_TITLE;
const courseTitle = process.env.E2E_COURSE_TITLE;

test.describe("journey one: redeem and read", () => {
  test.skip(
    !seatCode || !caseTitle,
    "needs a seeded backend (set E2E_SEAT_CODE and E2E_CASE_TITLE)",
  );

  test("a seat code opens the course and reads the case", async ({ page }) => {
    await page.goto("/enter");
    await page.getByLabel("Course code").fill(seatCode!);
    await page.getByRole("button", { name: "Enter course" }).click();

    await expect(page).toHaveURL(/\/course$/);
    if (courseTitle) {
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        courseTitle,
      );
    }

    const link = page.getByRole("link", { name: new RegExp(caseTitle!) });
    await expect(link).toBeVisible();
    await link.click();

    await expect(page).toHaveURL(/\/course\/\d+$/);
    await expect(
      page.getByRole("heading", { level: 1, name: caseTitle! }),
    ).toBeVisible();
    // The body actually rendered: the KaTeX math from the case study is typeset.
    await expect(page.locator(".katex").first()).toBeVisible();
  });
});
