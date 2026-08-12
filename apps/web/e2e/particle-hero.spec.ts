import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "./axe";

// The particle hero (guide 3.3, milestone 9.5), checked in a real browser
// because its five engineering rules are all runtime properties: a unit test
// can prove the fallbacks and the timeline, but only a browser can show that
// the canvas mounted, sat behind the content, and never took a click.
//
// The landing page is the one surface that carries the hero and needs no
// backend, so it is where these run; course home carries the same component.

test.describe("the particle hero", () => {
  test("mounts a canvas behind the content, without pointer events", async ({ page }) => {
    await page.goto("/");

    const canvas = page.locator("canvas");
    await expect(canvas).toBeAttached();

    const placement = await canvas.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        pointerEvents: style.pointerEvents,
        zIndex: style.zIndex,
        position: style.position,
        ariaHidden: el.getAttribute("aria-hidden"),
      };
    });
    // Rule 1's other half: it is decoration, so it never intercepts a pointer
    // and never reaches assistive technology.
    expect(placement.pointerEvents).toBe("none");
    expect(placement.position).toBe("absolute");
    expect(Number(placement.zIndex)).toBeLessThan(0);
    expect(placement.ariaHidden).toBe("true");
  });

  test("does not take the click that belongs to the page beneath it", async ({ page }) => {
    await page.goto("/");
    // The wordmark sits inside the hero's box, so if the canvas were in the way
    // this would hit the canvas instead.
    const target = page.getByRole("heading", { level: 1 });
    await expect(target).toBeVisible();
    const hit = await target.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return top?.tagName ?? "";
    });
    expect(hit).not.toBe("CANVAS");
  });

  test("leaves the content complete and interactive whatever the canvas does", async ({
    page,
  }) => {
    await page.goto("/");
    // Rule 1: the hero's own text is server-rendered, so it is here regardless
    // of whether the field ever mounted.
    await expect(page.getByRole("heading", { level: 1, name: "Tirocinium" })).toBeVisible();
    await expect(page.getByText("Every problem, freshly ruled.")).toBeVisible();
  });

  test("has no accessibility violations with the hero running", async ({ page }) => {
    await page.goto("/");
    await expectNoA11yViolations(page);
  });
});

test.describe("the hero under reduced motion", () => {
  // Rule 4, the hard requirement: the resolved state as a still image. The
  // context is built explicitly because test.use({ reducedMotion }) does not
  // apply here (see accessibility.spec.ts).
  test("renders the still and never starts a frame loop", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();

    // Count animation frames: the field must never request one.
    await page.addInitScript(() => {
      (window as unknown as { __frames: number }).__frames = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => {
        (window as unknown as { __frames: number }).__frames += 1;
        return raf(cb);
      };
    });

    await page.goto("/");
    await expect(page.locator("svg[aria-hidden='true']")).toBeAttached();
    // The canvas is present but hidden, so nothing reflows when the decision
    // lands; what is drawn is the still.
    await expect(page.locator("canvas")).toHaveClass(/hidden/);

    await page.waitForTimeout(1_200);
    const frames = await page.evaluate(
      () => (window as unknown as { __frames: number }).__frames,
    );
    await context.close();
    // React and Next request frames of their own during hydration, so this is a
    // ceiling rather than zero: a running field would be requesting one per
    // frame and would be far past this after a second.
    expect(frames).toBeLessThan(20);
  });

  test("the still is the resolved curve, not a placeholder", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");

    // The still arrives with hydration, since the whole field is behind a
    // dynamic import: wait for it rather than counting an empty page.
    const paths = page.locator("svg[aria-hidden='true'] path");
    // The filled area under the curve, and the curve itself.
    await expect(paths).toHaveCount(2);
    await context.close();
  });
});
