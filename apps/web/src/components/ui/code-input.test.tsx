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
  return <CodeInput label="Seat code" value={code} onChange={setCode} />;
}

describe("CodeInput", () => {
  it("formats as the student types", () => {
    render(<Harness />);
    const input = screen.getByLabelText<HTMLInputElement>("Seat code");
    fireEvent.change(input, { target: { value: "mk4t9rwf" } });
    expect(input.value).toBe("MK4T-9RWF");
  });

  it("accepts a paste in any formatting", () => {
    render(<Harness />);
    const input = screen.getByLabelText<HTMLInputElement>("Seat code");
    fireEvent.change(input, { target: { value: " mk4t-9rwf c2hp.x6zd " } });
    expect(input.value).toBe("MK4T-9RWF-C2HP-X6ZD");
  });

  it("never grows past a full code", () => {
    render(<Harness />);
    const input = screen.getByLabelText<HTMLInputElement>("Seat code");
    fireEvent.change(input, { target: { value: "MK4T9RWFC2HPX6ZD00" } });
    expect(input.value).toBe("MK4T-9RWF-C2HP-X6ZD");
  });
});

// The card a student is holding calls this their seat, and the professor
// issues one per seat rather than per course. The label is the only place the
// product gets to say which, so it is worth a test.
it("describes the field with its hint, for a screen reader as well as a reader", () => {
  render(
    <CodeInput
      label="Seat code"
      hint="On the card from your professor."
      value=""
      onChange={() => {}}
    />,
  );

  const field = screen.getByLabelText("Seat code");
  const describedBy = field.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  expect(document.getElementById(describedBy as string)?.textContent).toBe(
    "On the card from your professor.",
  );
});

it("leaves the field undescribed when there is no hint", () => {
  render(<CodeInput label="Seat code" value="" onChange={() => {}} />);
  expect(screen.getByLabelText("Seat code").getAttribute("aria-describedby")).toBeNull();
});
