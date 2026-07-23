import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "./axe";
import { sharpPagePng } from "./fixtures";

// Journey two (Phase 3 gate): the upload happy path, end to end through the UI
// on both viewports. A seat enters its course, opens the upload surface for a
// variant, adds a page photo, sends it, and watches it process to "read".
//
// What the seed provides, because none of it has a UI yet: an active seat
// scoped to a course (E2E_SEAT_CODE, as journey one), a published case study in
// that course (E2E_CASE_STUDY_ID), and a variant of it to file against
// (E2E_VARIANT_ID; exposing a variant to the problem view is Phase 5,
// decision 0019). The happy path also needs the transcription worker running
// against recorded model responses, so the submission actually reaches
// "processed" rather than sitting in "processing". To run it: start the API and
// the worker, seed those, export the values, then `pnpm test:e2e`.
const seatCode = process.env.E2E_SEAT_CODE;
const caseStudyId = process.env.E2E_CASE_STUDY_ID;
const variantId = process.env.E2E_VARIANT_ID;

test.describe("journey two: upload a solution and see it read", () => {
  test.skip(
    !seatCode || !caseStudyId || !variantId,
    "needs a seeded backend and worker (set E2E_SEAT_CODE, E2E_CASE_STUDY_ID, E2E_VARIANT_ID)",
  );

  test("a seat uploads a page and it processes to read", async ({ page }) => {
    await page.goto("/enter");
    await page.getByLabel("Course code").fill(seatCode!);
    await page.getByRole("button", { name: "Enter course" }).click();
    await expect(page).toHaveURL(/\/course$/);

    await page.goto(`/course/${caseStudyId}/upload?variant=${variantId}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Upload your solution" }),
    ).toBeVisible();

    await page.getByLabel("Choose photos").setInputFiles({
      name: "page-1.png",
      mimeType: "image/png",
      buffer: sharpPagePng(),
    });
    await expect(page.getByText("Page 1")).toBeVisible();

    await expectNoA11yViolations(page);

    await page.getByRole("button", { name: "Send 1 page" }).click();

    // The upload, complete, and worker run off the request path, so allow the
    // stream time to arrive at the terminal outcome.
    await expect(page.getByText("We have read all your pages.")).toBeVisible({
      timeout: 30_000,
    });
  });
});
