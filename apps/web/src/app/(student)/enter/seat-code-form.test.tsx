import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { strings } from "../strings";
import { SeatCodeForm } from "./seat-code-form";

// Guide 4.0: one screen, one action, one honest failure line. The copy never
// distinguishes wrong from revoked from malformed, so an incomplete code and
// a rejected code surface the identical string, announced via a live region.
describe("seat code entry", () => {
  it("shows the field and the single action, nothing else", () => {
    render(<SeatCodeForm />);
    expect(screen.getByLabelText(strings.enter.codeLabel)).toBeDefined();
    expect(screen.getByRole("button", { name: strings.enter.action })).toBeDefined();
    expect(screen.queryByText(strings.enter.failure)).toBeNull();
  });

  it("submitting an incomplete code shows the one honest line", async () => {
    render(<SeatCodeForm />);
    fireEvent.change(screen.getByLabelText(strings.enter.codeLabel), {
      target: { value: "MK4T" },
    });
    fireEvent.click(screen.getByRole("button", { name: strings.enter.action }));
    expect(await screen.findByText(strings.enter.failure)).toBeDefined();
  });

  it("a full code that the backend rejects shows the same line", async () => {
    render(<SeatCodeForm />);
    fireEvent.change(screen.getByLabelText(strings.enter.codeLabel), {
      target: { value: "MK4T9RWFC2HPX6ZD" },
    });
    fireEvent.click(screen.getByRole("button", { name: strings.enter.action }));
    expect(await screen.findByText(strings.enter.failure)).toBeDefined();
  });

  it("announces failure via a live region", async () => {
    render(<SeatCodeForm />);
    fireEvent.click(screen.getByRole("button", { name: strings.enter.action }));
    const status = await screen.findByRole("status");
    expect(status.textContent).toBe(strings.enter.failure);
  });
});
