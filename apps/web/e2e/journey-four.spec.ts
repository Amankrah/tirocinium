import { expect, test } from "@playwright/test";

// Journey four (Phase 4 gate): a professor reviews a PDF import end to end through
// the UI, on both viewports. Sign in, open the confirmation surface for a ready
// import, adjust a figure by drawing a box on a source page, merge the next
// problem into one, confirm it, and see the resulting draft render with its
// figure in the problem view.
//
// What the seed provides, because none of it has a UI that produces it cheaply:
// a professor account (E2E_PRO_EMAIL/PASSWORD), and a decoded import already in
// "ready" state (E2E_COURSE_ID, E2E_IMPORT_ID) with at least two staged items,
// one carrying a figure on a source page. The decode and segmentation run in the
// worker against recorded model responses. To run it: seed those, export the
// values, then `pnpm test:e2e`.
const proEmail = process.env.E2E_PRO_EMAIL;
const proPassword = process.env.E2E_PRO_PASSWORD;
const courseId = process.env.E2E_COURSE_ID;
const importId = process.env.E2E_IMPORT_ID;

test.describe("journey four: review, adjust, merge, confirm", () => {
  test.skip(
    !proEmail || !proPassword || !courseId || !importId,
    "needs a seeded ready import (set E2E_PRO_EMAIL, E2E_PRO_PASSWORD, E2E_COURSE_ID, E2E_IMPORT_ID)",
  );

  test("a professor confirms an imported problem and its draft renders", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(proEmail!);
    await page.getByLabel("Password").fill(proPassword!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto(`/courses/${courseId}/imports/${importId}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Review and confirm" }),
    ).toBeVisible();

    // Adjust a crop: draw a box on the first source page (the server crops it
    // from the lossless source). A drag across the middle of the page.
    const sourcePage = page.getByRole("group", { name: /Source page/ }).first();
    const box = await sourcePage.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
      await page.mouse.up();
    }

    // Merge the next problem into the first, then confirm the survivor.
    await page.getByRole("button", { name: "Merge with next" }).first().click();
    await page.getByRole("button", { name: "Confirm" }).first().click();

    // The confirmed item links to its draft; open it and see the problem view
    // render, figures included.
    await page.getByRole("link", { name: "Open the draft" }).first().click();
    await expect(page).toHaveURL(/\/case-studies\/\d+$/);
    await expect(page.locator("img").first()).toBeVisible();
  });
});
