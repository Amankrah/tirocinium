import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// WCAG 2.2 AA is the floor (frontend guide 6). Every shipped surface is asserted
// clean at those tags; a violation fails the journey it appears in.
export async function expectNoA11yViolations(page: Page) {
  // Wait for the page to be laid out before measuring it. WCAG 2.2 brought in
  // rules that read geometry rather than markup (2.5.8 target size is the one
  // that bites here), and geometry is a lie until the stylesheets and fonts have
  // applied: against `next dev` under parallel load, axe would otherwise measure
  // a button at its unstyled height and report a violation that does not exist
  // in the product. This is what made journey five retry-dependent.
  await page.waitForLoadState("load");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}
