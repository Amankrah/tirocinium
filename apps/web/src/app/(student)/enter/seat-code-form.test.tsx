import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { strings } from "../strings";
import { enterCourse } from "./actions";
import { SeatCodeForm } from "./seat-code-form";

// The server action and the router are the form's two seams; both are mocked so
// the component's own behaviour (guide 4.0: one honest line on failure,
// announced via a live region; a brief resolve into the course on success) is
// what is under test, not the network or navigation.
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./actions", () => ({ enterCourse: vi.fn() }));

const enterCourseMock = vi.mocked(enterCourse);

afterEach(() => vi.clearAllMocks());

function typeCode(value: string) {
  fireEvent.change(screen.getByLabelText(strings.enter.codeLabel), {
    target: { value },
  });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: strings.enter.action }));
}

describe("seat code entry", () => {
  it("shows the field and the single action, nothing else", () => {
    render(<SeatCodeForm />);
    expect(screen.getByLabelText(strings.enter.codeLabel)).toBeDefined();
    expect(screen.getByRole("button", { name: strings.enter.action })).toBeDefined();
    expect(screen.queryByText(strings.enter.failure)).toBeNull();
  });

  it("an incomplete code shows the one honest line without a round trip", async () => {
    render(<SeatCodeForm />);
    typeCode("MK4T");
    submit();
    expect(await screen.findByText(strings.enter.failure)).toBeDefined();
    expect(enterCourseMock).not.toHaveBeenCalled();
  });

  it("a full code the backend rejects shows the same line and does not navigate", async () => {
    enterCourseMock.mockResolvedValue({ ok: false });
    render(<SeatCodeForm />);
    typeCode("MK4T9RWFC2HPX6ZD");
    submit();
    expect(await screen.findByText(strings.enter.failure)).toBeDefined();
    expect(push).not.toHaveBeenCalled();
  });

  it("a full code the backend accepts resolves into the course", async () => {
    enterCourseMock.mockResolvedValue({ ok: true });
    render(<SeatCodeForm />);
    typeCode("MK4T9RWFC2HPX6ZD");
    submit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/course"));
    expect(screen.queryByText(strings.enter.failure)).toBeNull();
  });

  it("announces failure via a live region", async () => {
    render(<SeatCodeForm />);
    submit();
    const status = await screen.findByRole("status");
    expect(status.textContent).toBe(strings.enter.failure);
  });
});
