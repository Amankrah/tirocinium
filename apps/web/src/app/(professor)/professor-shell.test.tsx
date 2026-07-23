import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProfessorShell } from "./professor-shell";
import { strings } from "./strings";

// Professors are not pseudonymous: the shell shows the signed-in email and,
// unlike the student shell, a sign-out control (decision 0012).
describe("ProfessorShell", () => {
  it("shows the wordmark, the email, a sign-out control, and its content", () => {
    render(
      <ProfessorShell email="prof@uni.edu" signOut={async () => {}}>
        <p>dashboard content</p>
      </ProfessorShell>,
    );
    expect(screen.getByText(strings.shell.wordmark)).toBeDefined();
    expect(screen.getByText("prof@uni.edu")).toBeDefined();
    expect(screen.getByRole("button", { name: strings.shell.signOut })).toBeDefined();
    expect(screen.getByText("dashboard content")).toBeDefined();
  });
});
