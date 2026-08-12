import { expect, type Page, test } from "@playwright/test";

import { expectNoA11yViolations } from "./axe";

// Milestone 9.3, the automatable half: the dark theme audited by axe against
// real computed styles, and reduced motion verified on the rendered page rather
// than argued from the stylesheet. The manual VoiceOver and NVDA passes are the
// other half and are a human sign-off; the checklist is in
// docs/accessibility-manual-passes.md.
//
// These run on the surfaces that need no backend, which is the same set the
// entry journeys cover. The seeded surfaces carry their own axe assertions
// inside their journeys, so nothing is checked twice and nothing is missed.
const SURFACES = [
  { path: "/", name: "landing" },
  { path: "/enter", name: "seat entry" },
  { path: "/sign-in", name: "professor sign-in" },
  { path: "/sign-up", name: "professor sign-up" },
];

// Reduced motion is emulated by building the context explicitly rather than
// through `test.use({ reducedMotion })`, which silently does not apply here:
// under it `matchMedia("(prefers-reduced-motion: reduce)")` still reported
// false, so every assertion below would have passed against a page that had
// never been told to reduce motion. A vacuous accessibility test is worse than
// none, so the emulation is asserted first, in `reducedMotionPage` itself.
// `colorScheme` through `test.use` does work, and is used as such below.
async function reducedMotionPage(
  browser: import("@playwright/test").Browser,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  return { page, close: () => context.close() };
}

// The token layer inverts on prefers-color-scheme, so a dark run is a genuinely
// different set of computed colours, and axe recomputes contrast from them.
// This is the check that would have caught the four failures decision 0062
// records, one of which (the accent as link text, 3.28:1) exists only in dark.
test.describe("the dark theme", () => {
  test.use({ colorScheme: "dark" });

  for (const surface of SURFACES) {
    test(`${surface.name} has no accessibility violations in dark mode`, async ({
      page,
    }) => {
      await page.goto(surface.path);
      await expectNoA11yViolations(page);
    });
  }

  test("the page actually renders dark, so the audit above is not measuring light", async ({
    page,
  }) => {
    await page.goto("/");
    const ground = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--color-ground")
        .trim(),
    );
    // #12141A, the guide 3.2 dark ground.
    expect(ground.toLowerCase()).toBe("#12141a");
  });
});

test.describe("reduced motion", () => {
  test("is actually emulated, and collapses the motion duration to nothing", async ({
    browser,
  }) => {
    const { page, close } = await reducedMotionPage(browser);
    await page.goto("/");
    const info = await page.evaluate(() => ({
      matches: matchMedia("(prefers-reduced-motion: reduce)").matches,
      duration: getComputedStyle(document.documentElement)
        .getPropertyValue("--motion-duration")
        .trim(),
    }));
    await close();

    // Asserted first: without this the rest of this describe means nothing.
    expect(info.matches).toBe(true);
    // Asserted as a duration rather than a spelling: the token is authored as
    // `0ms` and the production minifier rewrites it to the equivalent `0s`.
    expect(info.duration).toMatch(/^0m?s$/);
  });

  test("leaves the duration in place when motion is welcome", async ({ browser }) => {
    // The mirror of the test above: without it, a token accidentally pinned to
    // zero everywhere would pass the reduced-motion check while quietly killing
    // the functional micro-interactions guide 3.3 does want.
    const context = await browser.newContext({ reducedMotion: "no-preference" });
    const page = await context.newPage();
    await page.goto("/");
    const duration = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--motion-duration")
        .trim(),
    );
    await context.close();
    expect(duration).not.toMatch(/^0m?s$/);
  });

  for (const surface of SURFACES) {
    test(`${surface.name} runs no animation under reduced motion`, async ({
      browser,
    }) => {
      const { page, close } = await reducedMotionPage(browser);
      await page.goto(surface.path);
      // getAnimations() reports what the document is actually running, which
      // covers CSS animations and transitions whatever declared them. Nothing
      // on these surfaces animates ambiently (guide 3.3: only the particle
      // field ever will, and it renders a still under this setting).
      const running = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a.playState === "running")
          .map((a) => a.constructor.name),
      );
      await close();
      expect(running).toEqual([]);
    });
  }

  test("still renders every surface's content, rather than degrading it", async ({
    browser,
  }) => {
    // Reduced motion removes motion, never information: the pages are whole.
    const { page, close } = await reducedMotionPage(browser);
    await page.goto("/enter");
    await expect(page.getByLabel("Course code")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enter course" })).toBeVisible();
    await close();
  });
});

// Guide 6 makes full keyboard operability the floor, so the entry surfaces are
// asserted reachable and operable from the keyboard alone.
test.describe("keyboard operability", () => {
  test("the seat code can be entered and submitted without a pointer", async ({
    page,
  }) => {
    await page.goto("/enter");
    const field = page.getByLabel("Course code");
    await field.focus();
    await page.keyboard.type("ABCD1234ABCD1234");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Enter course" })).toBeFocused();
  });

  test("focus is visible where it lands, not suppressed", async ({ page }) => {
    await page.goto("/enter");
    await page.getByLabel("Course code").focus();
    const outline = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const style = getComputedStyle(el);
      return { width: style.outlineWidth, style: style.outlineStyle };
    });
    // The visual language designs its own focus ring (guide 6), so what matters
    // is that one exists rather than that it is the user agent's.
    expect(outline).not.toBeNull();
    expect(outline?.style).not.toBe("none");
  });
});
