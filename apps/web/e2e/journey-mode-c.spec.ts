import { expect, test } from "@playwright/test";

// Mode C, on-platform pen capture (decision 0042, milestone 6.5.2/6.5.3), end to
// end through the UI on both viewports: a seat opens the upload surface, chooses
// "Write here", draws a page on the pad, adds it, sends it, and it processes to
// "read" through the same path as a photographed page. Seed-gated exactly like
// journey two (a seat, a case study, and a variant, plus the worker with
// recorded responses); skips without the env.
const seatCode = process.env.E2E_SEAT_CODE;
const caseStudyId = process.env.E2E_CASE_STUDY_ID;
const variantId = process.env.E2E_VARIANT_ID;

test.describe("mode C: write on the pad and submit", () => {
  test.skip(
    !seatCode || !caseStudyId || !variantId,
    "needs a seeded backend and worker (set E2E_SEAT_CODE, E2E_CASE_STUDY_ID, E2E_VARIANT_ID)",
  );

  test("a seat writes a page on the pad and it processes to read", async ({ page }) => {
    // As journey two: the 30 s allowed for processing has to come out of a test
    // budget that also pays for redeeming the seat and drawing on the pad.
    test.setTimeout(120_000);
    await page.goto("/enter");
    await page.getByLabel("Course code").fill(seatCode!);
    await page.getByRole("button", { name: "Enter course" }).click();
    await expect(page).toHaveURL(/\/course$/);

    await page.goto(`/course/${caseStudyId}/upload?variant=${variantId}`);
    await page.getByRole("button", { name: "Write here" }).click();

    // Draw a short stroke on the pad.
    const pad = page.getByRole("img", { name: "Handwriting page" });
    const box = await pad.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5);
      await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.7);
      await page.mouse.up();
    }

    await page.getByRole("button", { name: "Add this page" }).click();
    await expect(page.getByText("Page 1")).toBeVisible();

    await page.getByRole("button", { name: "Send 1 page" }).click();
    await expect(page.getByText("We have read all your pages.")).toBeVisible({
      timeout: 30_000,
    });
  });
});
