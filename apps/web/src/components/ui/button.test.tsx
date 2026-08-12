import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button, ButtonLink } from "./button";

describe("Button", () => {
  it("renders a real button with its label", () => {
    render(<Button>Enter course</Button>);
    const button = screen.getByRole("button", { name: "Enter course" });
    expect(button.tagName).toBe("BUTTON");
  });

  it("defaults to type=button so forms never submit by accident", () => {
    render(<Button>Enter course</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  it("passes type=submit through for form actions", () => {
    render(<Button type="submit">Enter course</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("submit");
  });
});

describe("ButtonLink", () => {
  it("is a link that shares the button look", () => {
    render(<ButtonLink href="/enter">Enter course</ButtonLink>);
    const link = screen.getByRole("link", { name: "Enter course" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/enter");
    expect(link.className).toContain("rounded-md");
  });
});
