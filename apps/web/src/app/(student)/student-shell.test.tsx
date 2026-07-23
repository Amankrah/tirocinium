import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StudentShell } from "./student-shell";
import { strings } from "./strings";

// Guide 4.0: the seat number stays quietly present in the shell, and nothing
// else about identity ever does (students are pseudonymous seats).
describe("StudentShell", () => {
  it("keeps the wordmark and the seat number present around its content", () => {
    render(
      <StudentShell seatNumber="S-014">
        <p>course content</p>
      </StudentShell>,
    );
    expect(screen.getByText(strings.shell.wordmark)).toBeDefined();
    expect(screen.getByText(strings.shell.seat("S-014"))).toBeDefined();
    expect(screen.getByText("course content")).toBeDefined();
  });
});
