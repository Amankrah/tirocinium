import { describe, expect, it } from "vitest";

import { lead, mass, money } from "./money";

// Money crosses the seam as integer cents and is divided exactly once, here
// (decision 0062). These pin the reading, not the arithmetic: the server owns
// the arithmetic.
describe("money", () => {
  it("reads cents as dollars", () => {
    expect(money(48_000)).toBe("$480.00");
  });

  it("keeps the cent on a line item that costs less than a dollar", () => {
    expect(money(78)).toBe("$0.78");
  });

  it("groups thousands so a five-figure total can be read at a glance", () => {
    expect(money(1_234_567)).toBe("$12,345.67");
  });

  it("does not round a zero away", () => {
    expect(money(0)).toBe("$0.00");
  });
});

describe("mass", () => {
  it("reads grams as kilograms once there is a kilogram to read", () => {
    expect(mass(100_000)).toBe("100 kg");
  });

  it("stays in grams below a kilogram, where kilograms would read as zero", () => {
    expect(mass(420)).toBe("420 g");
  });

  it("keeps one decimal, which is all a freight estimate can carry", () => {
    expect(mass(1_450)).toBe("1.5 kg");
  });

  it("says nothing weighs nothing", () => {
    expect(mass(0)).toBe("0 kg");
  });
});

describe("lead", () => {
  it("quotes working days, never a date", () => {
    expect(lead(10)).toBe("10 working days");
  });

  it("does not say 1 working days", () => {
    expect(lead(1)).toBe("1 working day");
  });

  it("calls nothing same day", () => {
    expect(lead(0)).toBe("Same day");
  });
});
