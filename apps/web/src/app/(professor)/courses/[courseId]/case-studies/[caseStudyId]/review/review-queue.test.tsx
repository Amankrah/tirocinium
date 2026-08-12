import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/lib/api/client";
import { ReviewQueue } from "./review-queue";

vi.mock("@/components/reading/client-problem-body", () => ({
  ClientProblemBody: (props: { body: string }) => <div>{props.body}</div>,
}));

function summary(id: number, reason: string): Schemas["VariantSummary"] {
  return { id, seed: 7, verification: "flagged", flag_reason: reason, model_id: "m", created_at: 1 };
}

function detail(id: number): Schemas["VariantDetail"] {
  return {
    id,
    body: "the body",
    solution: "generation solution",
    verify_solution: "re-solve solution",
    final_answers: ["42"],
    values: { rate: 0.06 },
    verification: "flagged",
    flag_reason: "disagree",
    model_id: "m",
    seed: 7,
    created_at: 1,
    verify_model_id: "vm",
    generation_prompt_version: "g/v1",
    verification_prompt_version: "vv/v1",
  };
}

function renderQueue(items: Schemas["VariantSummary"][]) {
  const get = vi.fn(async (_c: number, id: number) => ({ detail: detail(id), figures: {} }));
  const promote = vi.fn(async () => summary(1, "x"));
  const edit = vi.fn(async () => summary(1, "x"));
  const remove = vi.fn(async () => true);
  const refetch = vi.fn(async () => ({ items: [], next_cursor: null }));
  const view = render(
    <ReviewQueue
      courseId={1}
      caseStudyId={2}
      initial={{ items, next_cursor: null }}
      get={get as never}
      promote={promote as never}
      edit={edit as never}
      remove={remove as never}
      refetch={refetch as never}
    />,
  );
  return { get, promote, edit, remove, refetch, view };
}

afterEach(() => vi.clearAllMocks());

describe("ReviewQueue", () => {
  it("shows the empty state when nothing is flagged", () => {
    renderQueue([]);
    expect(
      screen.getByText("No flagged variants. Every generated variant verified cleanly."),
    ).toBeDefined();
  });

  it("opens a variant to the two solutions side by side", async () => {
    renderQueue([summary(5, "The re-solve disagrees.")]);
    expect(screen.getByText("The re-solve disagrees.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Independent re-solve" }));
    expect(await screen.findByText("generation solution")).toBeDefined();
    expect(screen.getByText("re-solve solution")).toBeDefined();
  });

  it("promotes a variant, then refetches the flagged list", async () => {
    const { promote, refetch } = renderQueue([summary(5, "disagree")]);
    fireEvent.click(screen.getByRole("button", { name: "Independent re-solve" }));
    await screen.findByText("generation solution");
    fireEvent.click(screen.getByRole("button", { name: "Promote" }));
    await waitFor(() => expect(promote).toHaveBeenCalledWith(1, 5));
    expect(refetch).toHaveBeenCalledWith(1, 2, { state: "flagged" });
  });

  it("edits a solution, which lands the variant on manual", async () => {
    const { edit } = renderQueue([summary(5, "disagree")]);
    fireEvent.click(screen.getByRole("button", { name: "Independent re-solve" }));
    await screen.findByText("generation solution");
    fireEvent.click(screen.getByRole("button", { name: "Edit solution" }));
    fireEvent.change(screen.getByDisplayValue("generation solution"), {
      target: { value: "corrected solution" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(edit).toHaveBeenCalledWith(1, 5, { body: null, solution: "corrected solution" }),
    );
  });

  // Guide 4.4 makes the j/k model a launch requirement on this surface, because
  // triage is the whole job of it (journey six drives it end to end).
  describe("the keyboard model", () => {
    // The assertion that was missing when journey six found this: firing a
    // synthetic keydown at the handler proves the handler and says nothing
    // about whether a professor can get there. The queue has to be a tab stop
    // (decision 0067), and it has to say what it is when focus lands on it.
    it("is reachable by keyboard and names itself when focus lands", () => {
      const { view } = renderQueue([summary(5, "a")]);
      const queue = view.container.querySelector("ol") as HTMLElement;

      expect(queue.getAttribute("tabindex")).toBe("0");
      queue.focus();
      expect(document.activeElement).toBe(queue);
      expect(queue.getAttribute("aria-label")).toBe("Flagged variants queue");

      // And the description is the line that already lists the keys, so the
      // announcement on arrival says what j, k, Enter, a, and e do.
      const describedBy = queue.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      expect(view.container.querySelector(`#${describedBy}`)?.textContent).toContain(
        "j and k move through the queue",
      );
    });

    it("moves with j and k, and stops at both ends", () => {
      const { view } = renderQueue([summary(5, "a"), summary(6, "b")]);
      const queue = view.container.querySelector("ol") as HTMLElement;
      const rows = () => view.container.querySelectorAll("li");

      expect(rows()[0]?.getAttribute("aria-current")).toBe("true");
      fireEvent.keyDown(queue, { key: "k" });
      expect(rows()[0]?.getAttribute("aria-current")).toBe("true");

      fireEvent.keyDown(queue, { key: "j" });
      expect(rows()[1]?.getAttribute("aria-current")).toBe("true");
      fireEvent.keyDown(queue, { key: "j" });
      expect(rows()[1]?.getAttribute("aria-current")).toBe("true");
    });

    it("opens the comparison with Enter", async () => {
      const { get, view } = renderQueue([summary(5, "a"), summary(6, "b")]);
      const queue = view.container.querySelector("ol") as HTMLElement;

      fireEvent.keyDown(queue, { key: "j" });
      fireEvent.keyDown(queue, { key: "Enter" });

      await waitFor(() => expect(get).toHaveBeenCalledWith(1, 6));
      expect(await screen.findByText("re-solve solution")).toBeDefined();
    });

    it("promotes the selected variant with a", async () => {
      const { promote, view } = renderQueue([summary(5, "a"), summary(6, "b")]);
      const queue = view.container.querySelector("ol") as HTMLElement;

      fireEvent.keyDown(queue, { key: "j" });
      fireEvent.keyDown(queue, { key: "a" });

      await waitFor(() => expect(promote).toHaveBeenCalledWith(1, 6));
    });

    it("opens a closed card into its editor with e, rather than closing it", async () => {
      const { view } = renderQueue([summary(5, "a")]);
      const queue = view.container.querySelector("ol") as HTMLElement;

      fireEvent.keyDown(queue, { key: "e" });

      // The editor is open on the solution, which means the card opened rather
      // than toggling shut under the edit.
      expect(await screen.findByDisplayValue("generation solution")).toBeDefined();
    });

    it("leaves the keys alone while a solution is being edited", async () => {
      const { promote } = renderQueue([summary(5, "a")]);
      fireEvent.click(screen.getByRole("button", { name: "Independent re-solve" }));
      await screen.findByText("generation solution");
      fireEvent.click(screen.getByRole("button", { name: "Edit solution" }));

      const textarea = screen.getByDisplayValue("generation solution");
      fireEvent.keyDown(textarea, { key: "a" });
      expect(promote).not.toHaveBeenCalled();
    });
  });

  it("surfaces the block when a variant with submissions cannot be discarded", async () => {
    const remove = vi.fn(async () => false);
    render(
      <ReviewQueue
        courseId={1}
        caseStudyId={2}
        initial={{ items: [summary(5, "disagree")], next_cursor: null }}
        get={(async (_c: number, id: number) => ({ detail: detail(id), figures: {} })) as never}
        promote={vi.fn() as never}
        edit={vi.fn() as never}
        remove={remove as never}
        refetch={vi.fn(async () => ({ items: [], next_cursor: null })) as never}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Independent re-solve" }));
    await screen.findByText("generation solution");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() =>
      expect(
        screen.getByText("This variant has submissions and cannot be discarded."),
      ).toBeDefined(),
    );
  });
});
