import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { strings } from "../strings";
import { signUp } from "./actions";
import { SignUpForm } from "./sign-up-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./actions", () => ({ signUp: vi.fn() }));

const signUpMock = vi.mocked(signUp);

afterEach(() => vi.clearAllMocks());

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), {
    target: { value },
  });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: strings.signUp.action }));
}

function fillValid() {
  fill(strings.signUp.emailLabel, "prof@uni.edu");
  fill(strings.signUp.passwordLabel, "secretpass1");
  fill(strings.signUp.confirmLabel, "secretpass1");
}

describe("professor sign-up", () => {
  it("shows email, password, confirm, and the single action", () => {
    render(<SignUpForm />);
    expect(screen.getByLabelText(strings.signUp.emailLabel, { exact: true })).toBeDefined();
    expect(screen.getByLabelText(strings.signUp.passwordLabel, { exact: true })).toBeDefined();
    expect(screen.getByLabelText(strings.signUp.confirmLabel, { exact: true })).toBeDefined();
    expect(screen.getByText(strings.signUp.passwordHint)).toBeDefined();
    expect(screen.getByRole("button", { name: strings.signUp.action })).toBeDefined();
    expect(screen.queryByRole("status")?.textContent).toBe("");
  });

  it("empty fields show the missing line without a round trip", async () => {
    render(<SignUpForm />);
    submit();
    expect(await screen.findByText(strings.signUp.missing)).toBeDefined();
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("a short password is refused before the round trip", async () => {
    render(<SignUpForm />);
    fill(strings.signUp.emailLabel, "prof@uni.edu");
    fill(strings.signUp.passwordLabel, "short");
    fill(strings.signUp.confirmLabel, "short");
    submit();
    expect(await screen.findByText(strings.signUp.tooShort)).toBeDefined();
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("mismatched passwords are refused before the round trip", async () => {
    render(<SignUpForm />);
    fill(strings.signUp.emailLabel, "prof@uni.edu");
    fill(strings.signUp.passwordLabel, "secretpass1");
    fill(strings.signUp.confirmLabel, "secretpass2");
    submit();
    expect(await screen.findByText(strings.signUp.mismatch)).toBeDefined();
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("a duplicate email shows the exists line and does not navigate", async () => {
    signUpMock.mockResolvedValue({ ok: false, reason: "exists" });
    render(<SignUpForm />);
    fillValid();
    submit();
    expect(await screen.findByText(strings.signUp.exists)).toBeDefined();
    expect(push).not.toHaveBeenCalled();
  });

  it("accepted credentials resolve into the dashboard", async () => {
    signUpMock.mockResolvedValue({
      ok: true,
      auth: {
        token: "jwt.abc",
        professor: { id: 1, email: "prof@uni.edu", role: "professor" },
      },
    });
    render(<SignUpForm />);
    fillValid();
    submit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByText(strings.signUp.exists)).toBeNull();
  });

  it("announces failure via a live region", async () => {
    render(<SignUpForm />);
    submit();
    const status = await screen.findByRole("status");
    expect(status.textContent).toBe(strings.signUp.missing);
  });
});
