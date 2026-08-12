import { expect, test } from "@playwright/test";

// Journey one (Phase 2 gate), end to end through the UI: a professor signs in,
// opens their course, writes a case study with typeset math, and publishes it;
// then a seated student redeems a code, opens the same course, and reads the
// case the professor just published. Both halves run through the real UI against
// the real backend on both viewports.
//
// What still comes from the seed, not the UI: the professor account (so the
// journey starts ready to sign in), the course, and one active seat scoped to
// it. Seat
// codes only ever exist as object-storage artifacts, so a seat cannot be minted
// from a browser; the seed writes the shards directly and prints the plaintext
// code (see the web README for the seed-and-run recipe). The case study itself
// is authored fresh here, so the professor half is genuinely exercised.
const proEmail = process.env.E2E_PRO_EMAIL;
const proPassword = process.env.E2E_PRO_PASSWORD;
const courseTitle = process.env.E2E_COURSE_TITLE;
const seatCode = process.env.E2E_SEAT_CODE;

test.describe("journey one: author, publish, redeem, read", () => {
  test.skip(
    !proEmail || !proPassword || !courseTitle || !seatCode,
    "needs a seeded backend (set E2E_PRO_EMAIL, E2E_PRO_PASSWORD, E2E_COURSE_TITLE, E2E_SEAT_CODE)",
  );

  test("a professor publishes a case a seat then reads", async ({ browser }) => {
    // A unique title per run so reruns never collide in the course's list.
    const caseTitle = `Journey One ${Date.now()}`;
    const body = "# Statement\n\nShow that $E = mc^2$ for the body below.\n";

    // Professor half, through the UI.
    const proContext = await browser.newContext();
    const pro = await proContext.newPage();
    try {
      await pro.goto("/sign-in");
      await pro.getByLabel("Email").fill(proEmail!);
      await pro.getByLabel("Password").fill(proPassword!);
      await pro.getByRole("button", { name: "Sign in" }).click();
      await expect(pro).toHaveURL(/\/dashboard$/);

      await pro.getByRole("link", { name: courseTitle! }).click();
      await expect(pro).toHaveURL(/\/courses\/\d+$/);

      await pro.getByLabel("Title").fill(caseTitle);
      await pro.getByLabel(/Body/).fill(body);
      await pro.getByRole("button", { name: "Create case study" }).click();

      // The new draft appears in the list; publish it from its own row.
      const row = pro.getByRole("listitem").filter({ hasText: caseTitle });
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: "Publish", exact: true }).click();
      await expect(row.getByText("Published")).toBeVisible();
    } finally {
      await proContext.close();
    }

    // Student half, through the UI, in a clean context (its own seat cookie).
    const studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    try {
      await student.goto("/enter");
      await student.getByLabel("Course code").fill(seatCode!);
      await student.getByRole("button", { name: "Enter course" }).click();

      await expect(student).toHaveURL(/\/course$/);
      await expect(
        student.getByRole("heading", { level: 1 }),
      ).toContainText(courseTitle!);

      const link = student.getByRole("link", { name: caseTitle });
      await expect(link).toBeVisible();
      await link.click();

      await expect(student).toHaveURL(/\/course\/\d+$/);
      await expect(
        student.getByRole("heading", { level: 1, name: caseTitle }),
      ).toBeVisible();
      // The body actually rendered: the case study's math is typeset by KaTeX.
      await expect(student.locator(".katex").first()).toBeVisible();
    } finally {
      await studentContext.close();
    }
  });
});
