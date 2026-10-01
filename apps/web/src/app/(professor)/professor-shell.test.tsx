import { readFileSync } from "node:fs";
import { join } from "node:path";

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

// The sticky header and the scroll padding are one decision in two files, and
// the failure when they drift is quiet: the queues keep working, they just
// select a row you cannot see. These pin the coupling rather than the pixels.
describe("the sticky header reserves the space it occupies", () => {
  it("sticks to the top and takes its height from the shared token", () => {
    render(
      <ProfessorShell email="prof@uni.edu" signOut={async () => {}}>
        <p>content</p>
      </ProfessorShell>,
    );

    const header = screen.getByRole("banner");
    expect(header.className).toContain("sticky");
    expect(header.className).toContain("top-0");
    // Opaque, not translucent: content scrolling under a working surface has
    // to disappear, not ghost through it.
    expect(header.className).toContain("bg-ground");
    expect(header.className).toContain("min-h-[var(--app-header-height)]");
  });

  it("tells the scroll container to skip that height, from the same token", () => {
    const globals = readFileSync(
      join(__dirname, "..", "globals.css"),
      "utf8",
    );
    expect(globals).toMatch(
      /scroll-padding-top:\s*var\(--app-header-height\)/,
    );
  });
});
