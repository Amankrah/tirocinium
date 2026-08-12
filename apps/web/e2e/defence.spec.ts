import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "./axe";

// The voice defence (milestone 7.4), driven down its typed path, because CI has
// no microphone and because the typed path is a first-class route through the
// conversation rather than a consolation: it must be reachable from the first
// frame, and a session must survive on it alone (guide 4.2).
//
// What the seed provides: an active seat (E2E_SEAT_CODE), the case study the
// submission belongs to (E2E_CASE_STUDY_ID), and one of that seat's own
// submissions already at `processed` (E2E_DEFENCE_SUBMISSION_ID), since the
// conversation opens only once the handwriting has been read. It also needs the
// API running with a tutor seam configured. To run it: start the API and the
// worker, seed those, export the values, then `pnpm test:e2e`.
const seatCode = process.env.E2E_SEAT_CODE;
const caseStudyId = process.env.E2E_CASE_STUDY_ID;
const submissionId = process.env.E2E_DEFENCE_SUBMISSION_ID;

test.describe("the defence conversation, on its typed path", () => {
  test.skip(
    !seatCode || !caseStudyId || !submissionId,
    "needs a seeded backend with a processed submission (set E2E_SEAT_CODE, E2E_CASE_STUDY_ID, E2E_DEFENCE_SUBMISSION_ID)",
  );

  test("a seat opens a defence, answers by keyboard, and ends it", async ({ page }) => {
    await page.goto("/enter");
    await page.getByLabel("Course code").fill(seatCode!);
    await page.getByRole("button", { name: "Enter course" }).click();
    await expect(page).toHaveURL(/\/course$/);

    await page.goto(`/course/${caseStudyId}/defence/${submissionId}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Talk it through" }),
    ).toBeVisible();
    // Said once, before anything opens, because it is true and worth knowing.
    await expect(
      page.getByText("Your voice is not kept. The written conversation is."),
    ).toBeVisible();

    // The invitation is a surface in its own right, so it is checked before the
    // session replaces it.
    await expectNoA11yViolations(page);

    await page.getByRole("button", { name: "Start talking" }).click();

    // The keyboard is there as soon as the session is, not only once speech has
    // failed.
    const answer = page.getByLabel("Your answer");
    await expect(answer).toBeVisible({ timeout: 20_000 });
    await expectNoA11yViolations(page);

    await answer.fill("I averaged the two rates because the flow is steady.");
    await page.getByRole("button", { name: "Send" }).click();

    // The committed turn is what enters the transcript.
    await expect(
      page.getByText("I averaged the two rates because the flow is steady."),
    ).toBeVisible({ timeout: 20_000 });
    // And the tutor answers it, which is the whole point of the surface.
    await expect(page.getByText("Tutor")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "End the conversation" }).click();
    await expect(page.getByText("The conversation is over.")).toBeVisible({
      timeout: 20_000,
    });
    // The conversation ends cleanly and takes no more input (guide 4.2b: ending
    // cleanly is the point, not a reason to manufacture another turn).
    await expect(page.getByLabel("Your answer")).toBeHidden();
  });

  test("the whole keyboard route works without a pointer", async ({ page }) => {
    await page.goto("/enter");
    await page.getByLabel("Course code").fill(seatCode!);
    await page.getByRole("button", { name: "Enter course" }).click();
    // Wait for the redemption to land before navigating: the seat cookie is set
    // by that redirect, and leaving early lands back on /enter with nothing on
    // the page to press.
    await expect(page).toHaveURL(/\/course$/);
    await page.goto(`/course/${caseStudyId}/defence/${submissionId}`);

    // Tab to the start action and press it, then answer, all from the keyboard
    // (guide 6: full keyboard operability is the floor).
    const start = page.getByRole("button", { name: "Start talking" });
    await start.focus();
    await page.keyboard.press("Enter");

    const answer = page.getByLabel("Your answer");
    await expect(answer).toBeVisible({ timeout: 20_000 });
    await answer.focus();
    await page.keyboard.type("The rate is fixed by the pump curve.");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");

    await expect(
      page.getByText("The rate is fixed by the pump curve."),
    ).toBeVisible({ timeout: 20_000 });
  });
});
