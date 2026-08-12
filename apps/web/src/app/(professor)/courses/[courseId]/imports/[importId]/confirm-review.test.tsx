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

function figure(over: Partial<Schemas["ItemFigureOut"]>): Schemas["ItemFigureOut"] {
  return {
    figure_id: 1,
    token: "fig://1",
    role: "essential",
    source: "embedded_raster",
    image_url: "https://x",
    image_url_2x: null,
    width_px: 100,
    height_px: 80,
    page: 0,
    bbox: [0.1, 0.1, 0.2, 0.2],
    caption: null,
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
  const addBox = vi.fn(async () => ({ figure_id: 2, image_url: "https://y", width_px: 10, height_px: 10 }));
  const setRole = vi.fn(async () => true);
  const removeFig = vi.fn(async () => true);
  const merge = vi.fn(async () => ({
    survivor_id: 1,
    merged_item_id: 2,
    question_md: "q",
    solution_md: null,
    page_span: "3, 4",
    confidence: 0.4,
  }));
  const view = render(
    <ConfirmReview
      courseId={1}
      importId={7}
      initial={{ items, pages }}
      confirm={confirm as never}
      discard={discard as never}
      refetch={refetch as never}
      addBox={addBox as never}
      setRole={setRole as never}
      removeFig={removeFig as never}
      merge={merge as never}
    />,
  );
  return { confirm, discard, refetch, addBox, setRole, removeFig, merge, view };
}

const page0: Schemas["ImportPageOut"] = { page_index: 0, image_url: "blob:page0" };

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

  it("changes a selected figure's role and counts the intervention", async () => {
    const { setRole, confirm } = renderReview(
      [item({ id: 5, figures: [figure({ figure_id: 11, role: "essential", page: 0 })] })],
      [page0],
    );
    fireEvent.click(screen.getByRole("button", { name: "Figure 11" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark decorative" }));
    await waitFor(() =>
      expect(setRole).toHaveBeenCalledWith(1, 5, 11, "decorative"),
    );
    // The intervention count rides along to confirm.
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(
        1,
        5,
        expect.objectContaining({ figure_interventions: 1 }),
      ),
    );
  });

  it("removes a selected figure", async () => {
    const { removeFig } = renderReview(
      [item({ id: 5, figures: [figure({ figure_id: 11, page: 0 })] })],
      [page0],
    );
    fireEvent.click(screen.getByRole("button", { name: "Figure 11" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove figure" }));
    await waitFor(() => expect(removeFig).toHaveBeenCalledWith(1, 5, 11));
  });

  it("merges the next item into the survivor", async () => {
    const { merge } = renderReview([
      item({ id: 5, title: "First" }),
      item({ id: 8, title: "Second" }),
    ]);
    // The merge button belongs to the earlier (survivor) card.
    fireEvent.click(screen.getAllByRole("button", { name: "Merge with next" })[0]!);
    await waitFor(() => expect(merge).toHaveBeenCalledWith(1, 5, 8));
  });

  // Decision 0067: the surface takes focus on mount, but a professor who tabs
  // away has to be able to tab back rather than reaching for a card.
  it("is reachable by keyboard and names itself when focus lands", () => {
    const { view } = renderReview([item({ id: 5, title: "Sure", confidence: 0.95 })]);
    const root = view.container.firstElementChild as HTMLElement;

    expect(root.getAttribute("tabindex")).toBe("0");
    root.focus();
    expect(document.activeElement).toBe(root);
    expect(root.getAttribute("aria-label")).toBe("Detected problems queue");
    const describedBy = root.getAttribute("aria-describedby");
    expect(view.container.querySelector(`#${describedBy}`)?.textContent).toContain(
      "Move with j and k",
    );
  });

  it("moves the cursor with j/k and confirms with a", async () => {
    // Ordered low-confidence-first: Shaky (id 8) then Sure (id 5).
    const { confirm, view } = renderReview([
      item({ id: 5, title: "Sure", confidence: 0.95 }),
      item({ id: 8, title: "Shaky", confidence: 0.3 }),
    ]);
    const root = view.container.firstElementChild!;
    // Cursor starts on the first (Shaky); j moves to the second (Sure).
    fireEvent.keyDown(root, { key: "j" });
    fireEvent.keyDown(root, { key: "a" });
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(1, 5, expect.anything()));
  });
});
