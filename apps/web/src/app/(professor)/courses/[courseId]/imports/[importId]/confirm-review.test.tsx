import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/lib/api/client";
import { ConfirmReview } from "./confirm-review";

// Stub the lazily-loaded markdown so the surface test does not pull in
// react-markdown/KaTeX; its rendering is a separate concern.
vi.mock("./figure-markdown", () => ({
  FigureMarkdown: (props: { markdown: string }) => <div>{props.markdown}</div>,
}));

function item(over: Partial<Schemas["ImportItemOut"]>): Schemas["ImportItemOut"] {
  return {
    id: 1,
    title: null,
    question_md: "A question.",
    solution_md: "A solution.",
    page_span: "3",
    confidence: 0.9,
    notes: null,
    state: "pending",
    case_study_id: null,
    figures: [],
    ...over,
  };
}

function renderReview(items: Schemas["ImportItemOut"][], pages: Schemas["ImportPageOut"][] = []) {
  const confirm = vi.fn(async () => ({
    case_study_id: 9,
    item_id: 1,
    state: "confirmed",
    text_edit_distance: 0,
  }));
  const discard = vi.fn(async () => true);
  const refetch = vi.fn(async () => ({ items, pages }));
  render(
    <ConfirmReview
      courseId={1}
      importId={7}
      initial={{ items, pages }}
      confirm={confirm as never}
      discard={discard as never}
      refetch={refetch as never}
    />,
  );
  return { confirm, discard, refetch };
}

afterEach(() => vi.clearAllMocks());

describe("ConfirmReview", () => {
  it("shows the progress line and each item's text", async () => {
    renderReview([item({ id: 1, question_md: "First." }), item({ id: 2, question_md: "Second." })]);
    expect(screen.getByRole("status").textContent).toBe("0 of 2 confirmed");
    expect(await screen.findByText("First.")).toBeDefined();
    expect(await screen.findByText("Second.")).toBeDefined();
  });

  it("orders low-confidence first", () => {
    renderReview([
      item({ id: 1, title: "Sure", confidence: 0.95 }),
      item({ id: 2, title: "Shaky", confidence: 0.3 }),
    ]);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Shaky", "Sure"]);
  });

  it("badges a low-confidence item", () => {
    renderReview([item({ confidence: 0.3 })]);
    expect(screen.getByText("Low confidence")).toBeDefined();
  });

  it("confirms an item, then refetches", async () => {
    const { confirm, refetch } = renderReview([item({ id: 5 })]);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(1, 5, {
        question_md: null,
        solution_md: null,
        figure_interventions: 0,
      }),
    );
    expect(refetch).toHaveBeenCalledWith(1, 7);
  });

  it("sends edited text on confirm", async () => {
    const { confirm } = renderReview([item({ id: 5, question_md: "old" })]);
    fireEvent.click(screen.getByRole("button", { name: "Edit text" }));
    const box = screen.getByDisplayValue("old");
    fireEvent.change(box, { target: { value: "new question" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(
        1,
        5,
        expect.objectContaining({ question_md: "new question" }),
      ),
    );
  });

  it("discards an item, then refetches", async () => {
    const { discard, refetch } = renderReview([item({ id: 8 })]);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(discard).toHaveBeenCalledWith(1, 8));
    expect(refetch).toHaveBeenCalled();
  });

  it("links a confirmed item to its draft, with no confirm button", () => {
    renderReview([item({ id: 5, state: "confirmed", case_study_id: 42 })]);
    const link = screen.getByRole("link", { name: "Open the draft" });
    expect(link.getAttribute("href")).toBe("/courses/1/case-studies/42");
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  });
});
