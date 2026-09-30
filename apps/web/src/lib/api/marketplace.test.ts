import { describe, expect, it } from "vitest";

import { offersMarketplace, type Marketplace } from "./marketplace";

// decision 0079: the catalogue pin is course-wide and the shortlist is per case
// study, so the pin alone offered the link on every problem in a pricing
// course. The link follows the shortlist; reaching the marketplace does not.
describe("offersMarketplace", () => {
  const withShortlist = {
    ok: true as const,
    status: 200,
    data: { shortlist: [{ sku: "LMS-A36-PL06" }] } as unknown as Marketplace,
  };
  const noShortlist = {
    ok: true as const,
    status: 200,
    data: { shortlist: [] } as unknown as Marketplace,
  };

  it("offers the link on a case study the professor shortlisted", () => {
    expect(offersMarketplace(withShortlist)).toBe(true);
  });

  it("withholds it on a case study with no shortlist", () => {
    // A crystal-structure question in a pricing course: the control would have
    // nothing behind it, and a dead control is worse than no control.
    expect(offersMarketplace(noShortlist)).toBe(false);
  });

  it("withholds it when the course does not price materials at all", () => {
    // The front door answers 409, which is an ordinary way to run a course.
    expect(
      offersMarketplace({ ok: false, status: 409, error: null }),
    ).toBe(false);
  });

  it("withholds it when there is no variant to price against", () => {
    expect(offersMarketplace(null)).toBe(false);
  });
});
