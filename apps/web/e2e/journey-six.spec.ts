import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "./axe";

// Journey six (Phase 8 gate): triage the flagged queue by keyboard. A flagged
// variant is one where the independent re-solve disagreed with the generation,
// so this is the surface where a professor decides whether the platform got it
// wrong. Guide 4.4 makes the j/k model a launch requirement here, which is why
// this journey never touches the mouse after the queue is open.
//
// What the seed provides: the professor account and course (E2E_PRO_EMAIL,
// E2E_PRO_PASSWORD, E2E_COURSE_TITLE, as journey one) plus a case study with at
// least one flagged variant (E2E_CASE_STUDY_ID), which the seeded adversarial
// corpus of milestone 5.3 produces deterministically.
const email = process.env.E2E_PRO_EMAIL;
const password = process.env.E2E_PRO_PASSWORD;
const caseStudyId = process.env.E2E_FLAGGED_CASE_STUDY_ID;
const courseId = process.env.E2E_COURSE_ID;

test.describe("journey six: triage the flagged queue by keyboard", () => {
  test.skip(
    !email || !password || !caseStudyId || !courseId,
    "needs a seeded backend with a flagged variant (set E2E_PRO_EMAIL, E2E_PRO_PASSWORD, E2E_COURSE_ID, E2E_FLAGGED_CASE_STUDY_ID)",
  );

  test("a professor compares and promotes a flagged variant without a mouse", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto(`/courses/${courseId}/case-studies/${caseStudyId}/review`);
    await expect(
      page.getByText(
        "j and k move through the queue, Enter opens the comparison, a promotes, e edits.",
      ),
    ).toBeVisible();

    await expectNoA11yViolations(page);

    // Enter opens the comparison: the generation's solution beside the
    // independent re-solve, which is the whole basis for the decision.
    // The queue is a tab stop in its own right (decision 0067), so this presses
    // something a professor could have reached with Tab.
    const queue = page.locator("ol").first();
    await queue.focus();
    // The assertion that was missing: a list with no tabindex silently refuses
    // focus, and every key press after it goes to the document instead.
    await expect(queue).toBeFocused();
    await queue.press("Enter");
    // By role, because "Independent re-solve" is also the intro copy and the
    // per-card toggle: the two column headings are what says the comparison
    // opened.
    await expect(page.getByRole("heading", { name: "Generation" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Independent re-solve" }),
    ).toBeVisible();

    await expectNoA11yViolations(page);

    // a promotes the selected variant, which leaves the flagged list: the list
    // is the source of truth and every verb refetches it.
    const before = await page.locator("ol > li").count();
    await queue.press("a");
    await expect(page.locator("ol > li")).toHaveCount(before - 1, { timeout: 20_000 });
  });
});
