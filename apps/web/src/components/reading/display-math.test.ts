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
    expect(aligned).toContain("\\\\[1em]\n&=");
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
