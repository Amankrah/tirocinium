import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PracticeProblem } from "./practice-problem";

// The swapped body renders through the lazy client renderer; stub it so this
// test does not pull in react-markdown/KaTeX.
vi.mock("@/components/reading/client-problem-body", () => ({
  ClientProblemBody: (props: { body: string }) => <div>{props.body}</div>,
}));

function renderProblem(
  initialVariantId: number | null,
  startAttempt = vi.fn(async () => ({
    attempt_id: 77,
    variant_id: 12,
    started_at: 1_700_000_000,
  })),
) {
  // The swap hands back the variant with its figures already resolved
  // (decision 0066), since the resolve needs the seat token.
  const swap = vi.fn(async () => ({
    variant: { variant_id: 20, body: "a fresh variant" },
    figures: {},
  }));
  render(
    <PracticeProblem
      caseStudyId={2}
      initialVariantId={initialVariantId}
      swap={swap as never}
      startAttempt={startAttempt as never}
    >
      <div>the first variant</div>
    </PracticeProblem>,
  );
  return { swap, startAttempt };
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

  // The attempt span (guide 4.2, decision 0058). The start is an explicit act,
  // the server holds the clock, and none of it ever gates uploading.
  describe("the start-attempt moment", () => {
    it("records a start and carries the attempt into the upload", async () => {
      const { startAttempt } = renderProblem(12);
      expect(screen.getByRole("link", { name: "Upload solution" }).getAttribute("href")).toBe(
        "/course/2/upload?variant=12",
      );

      fireEvent.click(screen.getByRole("button", { name: "Start working" }));
      await waitFor(() => expect(startAttempt).toHaveBeenCalledWith(12));

      await waitFor(() =>
        expect(
          screen.getByRole("link", { name: "Upload solution" }).getAttribute("href"),
        ).toBe("/course/2/upload?variant=12&attempt=77"),
      );
      expect(
        screen.getByText(
          "We noted when you started. Your work will show the time you spent on it.",
        ),
      ).toBeDefined();
    });

    it("stops offering a start once one is running", async () => {
      renderProblem(12);
      fireEvent.click(screen.getByRole("button", { name: "Start working" }));
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Start working" })).toBeNull(),
      );
    });

    it("still lets the student upload when the start fails", async () => {
      const failing = vi.fn(async () => null);
      renderProblem(12, failing as never);
      fireEvent.click(screen.getByRole("button", { name: "Start working" }));
      await waitFor(() => expect(failing).toHaveBeenCalled());
      // No attempt cited, and the upload path is untouched: a lost span never
      // costs a submission.
      expect(screen.getByRole("link", { name: "Upload solution" }).getAttribute("href")).toBe(
        "/course/2/upload?variant=12",
      );
    });

    it("drops the attempt when the student swaps to a fresh variant", async () => {
      renderProblem(12);
      fireEvent.click(screen.getByRole("button", { name: "Start working" }));
      await waitFor(() =>
        expect(
          screen.getByRole("link", { name: "Upload solution" }).getAttribute("href"),
        ).toBe("/course/2/upload?variant=12&attempt=77"),
      );

      fireEvent.click(screen.getByRole("button", { name: "New variant" }));
      // A new problem is a new attempt; time spent on the old one is not
      // quietly credited to it.
      await waitFor(() =>
        expect(
          screen.getByRole("link", { name: "Upload solution" }).getAttribute("href"),
        ).toBe("/course/2/upload?variant=20"),
      );
    });
  });
});
