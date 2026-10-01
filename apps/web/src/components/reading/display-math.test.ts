import { describe, expect, it } from "vitest";

import { alignDisplayChain } from "./display-math";

describe("alignDisplayChain", () => {
  it("leaves a single relation alone", () => {
    expect(alignDisplayChain("\\rho = \\frac{nA}{V_C N_A}")).toBeNull();
  });

  it("breaks a chain at each top-level equals", () => {
    const aligned = alignDisplayChain(
      "R^3 = \\frac{4}{(6.023\\times10^{23})} = 2.086\\times10^{-24}",
    );
    expect(aligned).toContain("\\begin{aligned}");
    expect(aligned).toContain("R^3 &=");
    // This chain carries a fraction, so it takes the wider row gap.
    expect(aligned).toContain("\\\\[1.8em]\n&=");
    expect(aligned).toContain("&= 2.086\\times10^{-24}");
    // The exponent inside the fraction is not a place to break.
    expect(aligned).toContain("10^{23}");
  });

  it("does not break an equals that is already inside a group", () => {
    expect(alignDisplayChain("x = \\mathrm{a = b}")).toBeNull();
  });

  it("leaves a formula that already breaks itself", () => {
    expect(alignDisplayChain("\\begin{aligned} a &= b \\\\ &= c \\end{aligned}")).toBeNull();
  });
});

// A fraction is taller than the line it sits on, so a chain of them needs more
// between its rows than a chain of plain relations. The gap follows the
// content: the alloy substitution reads as overlapping rows at one em.
describe("the row gap follows what the rows carry", () => {
  it("opens the gap when the chain carries fractions", () => {
    const aligned = alignDisplayChain(
      String.raw`\frac{C_1}{\rho_1} = \frac{88}{4.51} = 19.5122`,
    );
    expect(aligned).toContain("\\\\[1.8em]");
  });

  it("leaves plain relations at the single em they already fit in", () => {
    const aligned = alignDisplayChain("a = b + c = d");
    expect(aligned).toContain("\\\\[1em]");
    expect(aligned).not.toContain("1.8em");
  });

  it("still breaks the chain at each top-level equals", () => {
    const aligned = alignDisplayChain(
      String.raw`\frac{a}{b} = \frac{1}{2} = 0.5`,
    );
    // Two top-level equals makes two rows, so one gap between them.
    expect((aligned ?? "").split("\\\\[").length - 1).toBe(1);
  });
});
