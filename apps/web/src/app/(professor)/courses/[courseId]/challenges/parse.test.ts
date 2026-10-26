import { describe, expect, it } from "vitest";

import { parseChallengeForm } from "./parse";

// The challenge form's reading (decision 0112): one requirement per line with
// its target after a pipe, constraints and SKUs one per line, weights 0 to 5
// with zeros dropped, and the status the intent decides.
describe("reading the challenge form", () => {
  it("reads lines, targets, weights and the shortlist", () => {
    const form = new FormData();
    form.set("title", "  A feed auger ");
    form.set("context", "A barn.");
    form.set("requirements", "Resist silage | pH 4\n\nCarry the torque\n");
    form.set("constraints", "Batch of 20\n");
    form.set("deliverable", "");
    form.set("weight-cost", "3");
    form.set("weight-corrosion", "9");
    form.set("weight-uv", "0");
    form.set("weight-wear", "4");
    form.set("candidate_families", "Steel vs. stainless");
    form.set("shortlist", "lms-a36-pl06\nBSA-316L-2B\n");

    expect(parseChallengeForm(form, "published")).toEqual({
      title: "A feed auger",
      context: "A barn.",
      requirements: [
        { text: "Resist silage", target: "pH 4" },
        { text: "Carry the torque", target: "" },
      ],
      constraints: ["Batch of 20"],
      deliverable: "",
      weights: { cost: 3, corrosion: 5 },
      candidate_families: "Steel vs. stainless",
      shortlist: ["LMS-A36-PL06", "BSA-316L-2B"],
      status: "published",
    });
  });
});
