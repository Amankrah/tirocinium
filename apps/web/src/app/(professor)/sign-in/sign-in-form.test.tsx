import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { strings } from "../strings";
import { signIn } from "./actions";
import { SignInForm } from "./sign-in-form";

// The server action and the router are the form's two seams; both are mocked so
// the component's own behaviour is what is under test. The failure line is the
// backend's one generic outcome, announced via a live region.
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./actions", () => ({ signIn: vi.fn() }));

const signInMock = vi.mocked(signIn);

afterEach(() => vi.clearAllMocks());

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: strings.signIn.action }));
}

describe("professor sign-in", () => {
  it("shows the two fields and the single action", () => {
    render(<SignInForm />);
    expect(screen.getByLabelText(strings.signIn.emailLabel)).toBeDefined();
    expect(screen.getByLabelText(strings.signIn.passwordLabel)).toBeDefined();
    expect(screen.getByRole("button", { name: strings.signIn.action })).toBeDefined();
    expect(screen.queryByText(strings.signIn.failure)).toBeNull();
  });

  it("empty fields show the one line without a round trip", async () => {
    render(<SignInForm />);
    submit();
    expect(await screen.findByText(strings.signIn.failure)).toBeDefined();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("rejected credentials show the same line and do not navigate", async () => {
    signInMock.mockResolvedValue({ ok: false });
    render(<SignInForm />);
    fill(strings.signIn.emailLabel, "prof@uni.edu");
    fill(strings.signIn.passwordLabel, "wrongpass12");
    submit();
    expect(await screen.findByText(strings.signIn.failure)).toBeDefined();
    expect(push).not.toHaveBeenCalled();
  });

  it("accepted credentials resolve into the dashboard", async () => {
    signInMock.mockResolvedValue({ ok: true });
    render(<SignInForm />);
    fill(strings.signIn.emailLabel, "prof@uni.edu");
    fill(strings.signIn.passwordLabel, "secretpass1");
    submit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByText(strings.signIn.failure)).toBeNull();
  });

  it("announces failure via a live region", async () => {
    render(<SignInForm />);
    submit();
    const status = await screen.findByRole("status");
    expect(status.textContent).toBe(strings.signIn.failure);
  });
});
