import { expect, test, type Locator } from "@playwright/test";

import { expectNoA11yViolations } from "./axe";

// The understanding unfold (guide 4.2, milestone 8.4), driven in a real browser
// because this surface renders the professor's own writing and decision 0068
// changed how: steps are typeset rather than printed as source, by the Server
// Component for what is already out and by the lazy client renderer for what is
// revealed next. Those are two code paths for one thing, and the interesting
// assertion is that they agree.
//
// What the seed provides: an active seat (E2E_SEAT_CODE) with a processed
// submission for a variant (E2E_CASE_STUDY_ID, E2E_VARIANT_ID), which is what
// earns the solution; without it the surface correctly refuses to open.
const seatCode = process.env.E2E_SEAT_CODE;
const caseStudyId = process.env.E2E_CASE_STUDY_ID;
const variantId = process.env.E2E_VARIANT_ID;

// What the student actually gets from a step, in terms the two renderers can be
// held to. Not innerHTML: a node the browser parsed from server HTML keeps that
// HTML's own text, while a node React built client-side re-serialises its inline
// styles, so KaTeX's `height:0.6833em` comes back as `height: 0.6833em;` and a
// byte comparison fails on a difference no reader could ever see.
async function readStep(step: Locator) {
  return {
    text: (await step.textContent()) ?? "",
    math: await step.locator(".katex").count(),
    figures: await step.locator("img").count(),
    tutorLink: await step.locator("a").getAttribute("href"),
  };
}

test.describe("the understanding unfold", () => {
  test.skip(
    !seatCode || !caseStudyId || !variantId,
    "needs a seeded backend with a submitted variant (set E2E_SEAT_CODE, E2E_CASE_STUDY_ID, E2E_VARIANT_ID)",
  );

  test("a step unfolds typeset, and reads the same after a reload", async ({ page }) => {
    await page.goto("/enter");
    await page.getByLabel("Course code").fill(seatCode!);
    await page.getByRole("button", { name: "Enter course" }).click();
    await expect(page).toHaveURL(/\/course$/);

    await page.goto(`/course/${caseStudyId}/solution/${variantId}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "The worked solution" }),
    ).toBeVisible();
    await expectNoA11yViolations(page);

    // Revealing moves forward only and the seat is shared with the other
    // viewport running this same journey, so nothing here assumes a count or a
    // position: it waits for more than there were, then follows the step it got
    // by the label that names it.
    const steps = page.locator("ol li");
    const before = await steps.count();
    // This journey consumes one step of the seeded solution per viewport, and a
    // reveal never rewinds, so a seed that has been read to the end has nothing
    // left to show. That is a consumed fixture rather than a broken surface, and
    // it says so instead of failing as if the product were wrong.
    const more = page.getByRole("button", { name: "Show the next step" });
    test.skip(
      (await more.count()) === 0,
      "the seeded solution is fully unfolded; reseed to run this again",
    );
    await more.click();
    await expect
      .poll(async () => steps.count(), { timeout: 20_000 })
      .toBeGreaterThan(before);

    // A step that was not already out when the page rendered comes through the
    // lazy client renderer, which is the path being checked here.
    const revealed = steps.last();
    const label = (await revealed.locator("h2").textContent()) ?? "";
    expect(label).toMatch(/^Step \d+$/);
    const viaClient = await readStep(revealed);
    // It is rendered, not printed: a step is markdown and must never reach the
    // student as source (decision 0068).
    expect(viaClient.text).not.toContain("fig://");
    expect(await revealed.locator(".reading-body").count()).toBe(1);

    await expectNoA11yViolations(page);

    // The same step arrives server-rendered on the way back in. Two renderers,
    // one result: if they ever drift, this is where it shows.
    await page.reload();
    const sameStep = steps.filter({ has: page.getByRole("heading", { name: label, exact: true }) });
    await expect(sameStep).toHaveCount(1, { timeout: 20_000 });
    expect(await readStep(sameStep)).toEqual(viaClient);
  });
});
