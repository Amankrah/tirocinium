import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VariantPreview } from "./variant-preview";

vi.mock("@/components/reading/client-problem-body", () => ({
  ClientProblemBody: (props: { body: string }) => <div>{props.body}</div>,
}));

function summary(id: number, seed: number, verification: string) {
  return { id, seed, verification, flag_reason: null, model_id: "m", created_at: 1 };
}

afterEach(() => vi.clearAllMocks());

describe("VariantPreview", () => {
  it("generates three, polls, and renders verified bodies and a flagged link", async () => {
    const generate = vi.fn(async () => ({ enqueued: 3, seeds: [1, 2, 3] }));
    const list = vi.fn(async () => ({
      items: [
        summary(10, 1, "verified"),
        summary(11, 2, "flagged"),
        summary(12, 3, "manual"),
      ],
      next_cursor: null,
    }));
    const get = vi.fn(async (_c: number, id: number) => ({
      id,
      body: `variant ${id}`,
      solution: "",
      verify_solution: null,
      final_answers: [],
      values: {},
      verification: "verified",
      flag_reason: null,
      model_id: "m",
      seed: 1,
      created_at: 1,
      verify_model_id: null,
      generation_prompt_version: null,
      verification_prompt_version: null,
    }));
    render(
      <VariantPreview
        courseId={1}
        caseStudyId={2}
        generate={generate as never}
        list={list as never}
        get={get as never}
        makeId={() => "key-1"}
        delay={async () => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Generate preview variants" }));

    await waitFor(() => expect(screen.getByText("variant 10")).toBeDefined());
    expect(screen.getByText("variant 12")).toBeDefined(); // manual serves too
    expect(screen.getByText("Flagged for review")).toBeDefined();
    expect(generate).toHaveBeenCalledWith(1, 2, 3, "key-1");
  });

  it("shows an honest error when generation cannot start", async () => {
    const generate = vi.fn(async () => null);
    render(
      <VariantPreview
        courseId={1}
        caseStudyId={2}
        generate={generate as never}
        list={vi.fn() as never}
        get={vi.fn() as never}
        delay={async () => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate preview variants" }));
    await waitFor(() =>
      expect(
        screen.getByText("Generation did not start. Save the parameters for this case study first."),
      ).toBeDefined(),
    );
  });
});
