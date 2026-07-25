import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PracticeProblem } from "./practice-problem";

// The swapped body renders through the lazy client renderer; stub it so this
// test does not pull in react-markdown/KaTeX.
vi.mock("@/components/reading/client-problem-body", () => ({
  ClientProblemBody: (props: { body: string }) => <div>{props.body}</div>,
}));

function renderProblem(initialVariantId: number | null) {
  const swap = vi.fn(async () => ({ variant_id: 20, body: "a fresh variant" }));
  render(
    <PracticeProblem caseStudyId={2} initialVariantId={initialVariantId} swap={swap as never}>
      <div>the first variant</div>
    </PracticeProblem>,
  );
  return { swap };
}

afterEach(() => vi.clearAllMocks());

describe("PracticeProblem", () => {
  it("shows the first variant and an upload link carrying its variant id", () => {
    renderProblem(12);
    expect(screen.getByText("the first variant")).toBeDefined();
    const upload = screen.getByRole("link", { name: "Upload solution" });
    expect(upload.getAttribute("href")).toBe("/course/2/upload?variant=12");
  });

  it("swaps in a new variant from the pool, excluding the current one", async () => {
    const { swap } = renderProblem(12);
    fireEvent.click(screen.getByRole("button", { name: "New variant" }));
    await waitFor(() => expect(swap).toHaveBeenCalledWith(2, 12));
    // The new body replaces the first, and upload now points at the new variant.
    expect(await screen.findByText("a fresh variant")).toBeDefined();
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Upload solution" }).getAttribute("href"),
      ).toBe("/course/2/upload?variant=20"),
    );
  });

  it("disables upload when there is no variant to file against", () => {
    renderProblem(null);
    expect(screen.queryByRole("link", { name: "Upload solution" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Upload solution" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
