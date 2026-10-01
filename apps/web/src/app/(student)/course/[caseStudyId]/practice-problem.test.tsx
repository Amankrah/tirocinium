import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PracticeProblem } from "./practice-problem";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

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
  pricesMaterials = false,
  openSolution = vi.fn(async () => true),
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
      pricesMaterials={pricesMaterials}
      swap={swap as never}
      startAttempt={startAttempt as never}
      openSolution={openSolution}
    >
      <div>the first variant</div>
    </PracticeProblem>,
  );
  return { swap, startAttempt, openSolution };
}

afterEach(() => {
  push.mockClear();
  vi.clearAllMocks();
});

describe("PracticeProblem", () => {
  it("shows the first variant and one way in, which is start working", () => {
    renderProblem(12);
    expect(screen.getByText("the first variant")).toBeDefined();
    expect(screen.getByRole("button", { name: "Start working" })).toBeDefined();
    expect(screen.queryByRole("link", { name: "Upload solution" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Upload solution" })).toBeNull();
    expect(screen.getByRole("button", { name: "See the solution" })).toBeDefined();
  });

  it("opens the whole worked solution for the variant on screen", async () => {
    const { openSolution } = renderProblem(12);
    fireEvent.click(screen.getByRole("button", { name: "See the solution" }));
    await waitFor(() => expect(openSolution).toHaveBeenCalledWith(12));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/course/2/solution/12"),
    );
  });

  it("follows a swapped variant into its solution", async () => {
    const { openSolution } = renderProblem(12);
    fireEvent.click(screen.getByRole("button", { name: "New variant" }));
    expect(await screen.findByText("a fresh variant")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "See the solution" }));
    await waitFor(() => expect(openSolution).toHaveBeenCalledWith(20));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/course/2/solution/20"),
    );
  });

  it("says so when the solution does not open", async () => {
    renderProblem(12, undefined, false, vi.fn(async () => false));
    fireEvent.click(screen.getByRole("button", { name: "See the solution" }));
    expect(
      await screen.findByText("The solution did not open. Try again."),
    ).toBeDefined();
    expect(push).not.toHaveBeenCalled();
  });

  it("swaps in a new variant from the pool, excluding the current one", async () => {
    const { swap, startAttempt } = renderProblem(12);
    fireEvent.click(screen.getByRole("button", { name: "New variant" }));
    await waitFor(() => expect(swap).toHaveBeenCalledWith(2, 12));
    // The new body replaces the first, and starting now files against it.
    expect(await screen.findByText("a fresh variant")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Start working" }));
    await waitFor(() => expect(startAttempt).toHaveBeenCalledWith(20));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/course/2/upload?variant=20&attempt=77"),
    );
  });

  it("says why work cannot start when there is no variant to file against", () => {
    renderProblem(null);
    expect(screen.queryByRole("button", { name: "Start working" })).toBeNull();
    expect(screen.queryByRole("button", { name: "See the solution" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Upload solution" })).toBeNull();
    expect(
      screen.getByText(
        "Uploading opens once your professor publishes a variant of this problem.",
      ),
    ).toBeDefined();
  });

  // The attempt span (guide 4.2, decision 0058). The start is an explicit act,
  // the server holds the clock, and a failed start still opens the page.
  describe("the start-attempt moment", () => {
    it("records a start and opens the writing page with that attempt", async () => {
      const { startAttempt } = renderProblem(12);

      fireEvent.click(screen.getByRole("button", { name: "Start working" }));
      await waitFor(() => expect(startAttempt).toHaveBeenCalledWith(12));

      await waitFor(() =>
        expect(push).toHaveBeenCalledWith("/course/2/upload?variant=12&attempt=77"),
      );
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
      // No attempt cited, and the writing page still opens: a lost span never
      // costs the work.
      await waitFor(() =>
        expect(push).toHaveBeenCalledWith("/course/2/upload?variant=12"),
      );
    });

    it("drops the attempt when the student swaps to a fresh variant", async () => {
      const { startAttempt } = renderProblem(12);
      fireEvent.click(screen.getByRole("button", { name: "Start working" }));
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Start working" })).toBeNull(),
      );

      fireEvent.click(screen.getByRole("button", { name: "New variant" }));
      // A new problem is a new attempt; time spent on the old one is not
      // quietly credited to it. Starting again files against the new variant.
      const again = await screen.findByRole("button", { name: "Start working" });
      fireEvent.click(again);
      await waitFor(() => expect(startAttempt).toHaveBeenLastCalledWith(20));
      await waitFor(() =>
        expect(push).toHaveBeenCalledWith("/course/2/upload?variant=20&attempt=77"),
      );
    });
  });

  // Phase 10: most courses do not price materials, and for those the link is
  // absent rather than disabled. A dead control is a worse answer than none.
  it("offers the marketplace only when the course prices materials", () => {
    renderProblem(12, undefined, false);
    expect(screen.queryByRole("link", { name: "Price your materials" })).toBeNull();
  });

  it("carries the current variant into the marketplace when it is on", () => {
    renderProblem(12, undefined, true);
    expect(
      screen.getByRole("link", { name: "Price your materials" }).getAttribute("href"),
    ).toBe("/course/2/marketplace?variant=12");
  });
});

// decision 0088: a dry pool answers with the base problem and a null variant
// id (the 5.4 pool invariant: never make the student wait). Swapping that in
// would replace the problem with identical text and drop the variant id, which
// hides "Start working" and leaves the student with a control that appears to
// have broken the page.
describe("PracticeProblem when the pool has nothing else to give", () => {
  function renderDry() {
    const swap = vi.fn(async () => ({
      variant: { variant_id: null, body: "the base problem, unchanged" },
      figures: {},
    }));
    render(
      <PracticeProblem
        caseStudyId={2}
        initialVariantId={12}
        pricesMaterials={false}
        swap={swap as never}
        startAttempt={vi.fn() as never}
        openSolution={vi.fn(async () => true)}
      >
        <div>the first variant</div>
      </PracticeProblem>,
    );
    return { swap };
  }

  it("keeps the problem and says why nothing changed", async () => {
    const { swap } = renderDry();
    fireEvent.click(screen.getByRole("button", { name: "New variant" }));
    await waitFor(() => expect(swap).toHaveBeenCalledWith(2, 12));
    expect(
      await screen.findByText(/only version of this problem/i),
    ).toBeDefined();
    // What was on screen stays on screen rather than being replaced by the
    // identical base text.
    expect(screen.getByText("the first variant")).toBeDefined();
  });

  it("leaves the way into the work where it was", async () => {
    const { swap } = renderDry();
    expect(screen.getByRole("button", { name: "Start working" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "New variant" }));
    await waitFor(() => expect(swap).toHaveBeenCalled());
    // Asking for another version must not cost the student the one control
    // that starts the attempt.
    expect(screen.getByRole("button", { name: "Start working" })).toBeDefined();
    expect(screen.queryByText(/Uploading opens once/i)).toBeNull();
  });
});
