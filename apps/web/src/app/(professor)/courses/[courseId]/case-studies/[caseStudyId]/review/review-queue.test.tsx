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
  const get = vi.fn(async (_c: number, id: number) => detail(id));
  const promote = vi.fn(async () => summary(1, "x"));
  const edit = vi.fn(async () => summary(1, "x"));
  const remove = vi.fn(async () => true);
  const refetch = vi.fn(async () => ({ items: [], next_cursor: null }));
  render(
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
  return { get, promote, edit, remove, refetch };
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

  it("surfaces the block when a variant with submissions cannot be discarded", async () => {
    const remove = vi.fn(async () => false);
    render(
      <ReviewQueue
        courseId={1}
        caseStudyId={2}
        initial={{ items: [summary(5, "disagree")], next_cursor: null }}
        get={(async (_c: number, id: number) => detail(id)) as never}
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
