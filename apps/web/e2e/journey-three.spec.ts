import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "./axe";
import { blurryPagePng, sharpPagePng } from "./fixtures";

// Journey three (Phase 3 gate): blurry-page rejection and retake, on both
// viewports. This exercises the client-side pre-check (frontend guide 4.1,
// step 2), which flags an out-of-focus page in the browser before any upload,
// so the student retakes it rather than discovering the problem after a round
// trip. The blur analysis runs on a real canvas here, which the component unit
// tests cannot cover.
//
// Seeded like journey two but lighter: it needs only a seat and a variant to
// reach the upload surface (E2E_SEAT_CODE, E2E_CASE_STUDY_ID, E2E_VARIANT_ID),
// not the worker, because the rejection happens client-side. The server-side
// needs-retake path (preprocessing refusing a page) is exercised by journey
// two's infrastructure with a page the corpus knows is unreadable.
const seatCode = process.env.E2E_SEAT_CODE;
const caseStudyId = process.env.E2E_CASE_STUDY_ID;
const variantId = process.env.E2E_VARIANT_ID;

const BLUR_WARNING =
  "This page looks blurry. Retake it, or send it and we will try.";

test.describe("journey three: a blurry page is caught and retaken", () => {
  test.skip(
    !seatCode || !caseStudyId || !variantId,
    "needs a seeded backend (set E2E_SEAT_CODE, E2E_CASE_STUDY_ID, E2E_VARIANT_ID)",
  );

  test("flags a blurry page, then clears once retaken", async ({ page }) => {
    await page.goto("/enter");
    await page.getByLabel("Course code").fill(seatCode!);
    await page.getByRole("button", { name: "Enter course" }).click();
    await expect(page).toHaveURL(/\/course$/);

    await page.goto(`/course/${caseStudyId}/upload?variant=${variantId}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Upload your solution" }),
    ).toBeVisible();

    // A blurry page is flagged in the browser, without an upload.
    await page.getByLabel("Choose photos").setInputFiles({
      name: "blurry.png",
      mimeType: "image/png",
      buffer: blurryPagePng(),
    });
    await expect(page.getByText(BLUR_WARNING)).toBeVisible();

    await expectNoA11yViolations(page);

    // Retake: drop the blurry page and add a sharp one; the warning clears.
    await page.getByRole("button", { name: "Remove page 1" }).click();
    await page.getByLabel("Choose photos").setInputFiles({
      name: "sharp.png",
      mimeType: "image/png",
      buffer: sharpPagePng(),
    });
    await expect(page.getByText("Page 1")).toBeVisible();
    await expect(page.getByText(BLUR_WARNING)).toHaveCount(0);
  });
});
