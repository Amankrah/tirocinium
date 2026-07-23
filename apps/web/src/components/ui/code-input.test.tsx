import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { CodeInput, normalizeSeatCode, formatSeatCode } from "./code-input";

// Guide 4.0: the course code field formats as it is typed into
// XXXX-XXXX-XXXX-XXXX groups with the Crockford alphabet enforced, and paste
// handles any formatting. Crockford base32 excludes I, L, O, U; entry is
// forgiving where decoding is unambiguous (o reads as 0, i and l as 1).

describe("normalizeSeatCode", () => {
  it("uppercases and strips separators", () => {
    expect(normalizeSeatCode("mk4t-9rwf c2hp.x6zd")).toBe("MK4T9RWFC2HPX6ZD");
  });

  it("maps ambiguous letters the Crockford way", () => {
    expect(normalizeSeatCode("oO")).toBe("00");
    expect(normalizeSeatCode("iIlL")).toBe("1111");
  });

  it("drops characters outside the alphabet, including U", () => {
    expect(normalizeSeatCode("MU!K?4uT")).toBe("MK4T");
  });

  it("caps at sixteen characters", () => {
    expect(normalizeSeatCode("MK4T9RWFC2HPX6ZDEXTRA")).toHaveLength(16);
  });
});

describe("formatSeatCode", () => {
  it("groups into fours with dashes", () => {
    expect(formatSeatCode("MK4T9RWFC2HPX6ZD")).toBe("MK4T-9RWF-C2HP-X6ZD");
  });

  it("leaves partial groups open", () => {
    expect(formatSeatCode("MK4T9R")).toBe("MK4T-9R");
    expect(formatSeatCode("")).toBe("");
  });
});

function Harness() {
  const [code, setCode] = useState("");
  return <CodeInput label="Course code" value={code} onChange={setCode} />;
}

describe("CodeInput", () => {
  it("formats as the student types", () => {
    render(<Harness />);
    const input = screen.getByLabelText<HTMLInputElement>("Course code");
    fireEvent.change(input, { target: { value: "mk4t9rwf" } });
    expect(input.value).toBe("MK4T-9RWF");
  });

  it("accepts a paste in any formatting", () => {
    render(<Harness />);
    const input = screen.getByLabelText<HTMLInputElement>("Course code");
    fireEvent.change(input, { target: { value: " mk4t-9rwf c2hp.x6zd " } });
    expect(input.value).toBe("MK4T-9RWF-C2HP-X6ZD");
  });

  it("never grows past a full code", () => {
    render(<Harness />);
    const input = screen.getByLabelText<HTMLInputElement>("Course code");
    fireEvent.change(input, { target: { value: "MK4T9RWFC2HPX6ZD00" } });
    expect(input.value).toBe("MK4T-9RWF-C2HP-X6ZD");
  });
});
