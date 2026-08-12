import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/lib/api/client";
import { SubmissionQueue } from "./submission-queue";

function row(
  over: Partial<Schemas["SubmissionSummary"]> = {},
): Schemas["SubmissionSummary"] {
  return {
    id: 1,
    seat_number: "014",
    case_study_id: 3,
    case_study_title: "Pump sizing",
    variant_id: 9,
    status: "processed",
    submitted_at: 1_700_000_000,
    page_count: 2,
    recognition_conf: 0.9,
    grade: null,
    graded_at: null,
    started_at: null,
    engaged_seconds: null,
    ...over,
  };
}

function setup(
  rows: Schemas["SubmissionSummary"][] = [row(), row({ id: 2, seat_number: "015" })],
  nextCursor: number | null = null,
) {
  const list = vi.fn(async () => ({ submissions: rows, next_cursor: null }));
  const navigate = vi.fn();
  const view = render(
    <SubmissionQueue
      courseId={3}
      initial={{ submissions: rows, next_cursor: nextCursor }}
      list={list as never}
      navigate={navigate}
    />,
  );
  return { list, navigate, view };
}

describe("the review queue", () => {
  it("shows the seat number, the reading confidence, and the grade so far", () => {
    setup([row({ recognition_conf: 0.83, grade: 0.75 })]);
    expect(screen.getByText("Seat 014")).toBeTruthy();
    expect(screen.getByText("83% sure of the reading")).toBeTruthy();
    expect(screen.getByText("Graded 75%")).toBeTruthy();
  });

  it("says a submission is ungraded rather than showing a zero", () => {
    setup([row({ grade: null })]);
    expect(screen.getAllByText("Not graded").length).toBeGreaterThan(0);
    expect(screen.queryByText("Graded 0%")).toBeNull();
  });

  it("marks a reading the platform is least sure of", () => {
    const { view } = setup([row({ recognition_conf: 0.4 })]);
    const cell = view.container.querySelector(".text-flag-amber");
    expect(cell?.textContent).toBe("40% sure of the reading");
  });

  // Decision 0067: a keyboard queue a professor cannot Tab to is a keyboard gap,
  // and a synthetic keydown at the handler never notices.
  it("is reachable by keyboard and names itself when focus lands", () => {
    const { view } = setup();
    const queue = view.container.firstElementChild as HTMLElement;

    expect(queue.getAttribute("tabindex")).toBe("0");
    queue.focus();
    expect(document.activeElement).toBe(queue);
    expect(queue.getAttribute("aria-label")).toBe("Submissions queue");
    const describedBy = queue.getAttribute("aria-describedby");
    expect(view.container.querySelector(`#${describedBy}`)?.textContent).toContain(
      "j and k move through the queue",
    );
  });

  it("moves with j and k and opens the selected row with Enter", () => {
    const { navigate, view } = setup();
    const queue = view.container.firstElementChild as HTMLElement;

    fireEvent.keyDown(queue, { key: "j" });
    expect(view.container.querySelectorAll("li")[1]?.getAttribute("aria-current")).toBe(
      "true",
    );

    fireEvent.keyDown(queue, { key: "Enter" });
    expect(navigate).toHaveBeenCalledWith("/courses/3/submissions/2");

    fireEvent.keyDown(queue, { key: "k" });
    fireEvent.keyDown(queue, { key: "Enter" });
    expect(navigate).toHaveBeenLastCalledWith("/courses/3/submissions/1");
  });

  it("does not run off either end of the queue", () => {
    const { navigate, view } = setup();
    const queue = view.container.firstElementChild as HTMLElement;

    fireEvent.keyDown(queue, { key: "k" });
    fireEvent.keyDown(queue, { key: "Enter" });
    expect(navigate).toHaveBeenLastCalledWith("/courses/3/submissions/1");

    fireEvent.keyDown(queue, { key: "j" });
    fireEvent.keyDown(queue, { key: "j" });
    fireEvent.keyDown(queue, { key: "j" });
    fireEvent.keyDown(queue, { key: "Enter" });
    expect(navigate).toHaveBeenLastCalledWith("/courses/3/submissions/2");
  });

  it("works by pointer too: every row is an ordinary link", () => {
    setup();
    const links = screen.getAllByRole("link");
    expect(links[0]?.getAttribute("href")).toBe("/courses/3/submissions/1");
    expect(links[1]?.getAttribute("href")).toBe("/courses/3/submissions/2");
  });

  it("filters by status through the server, never by re-sorting in the browser", async () => {
    const { list } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Needs a retake" }));
    await waitFor(() => expect(list).toHaveBeenCalledWith(3, { status: "needs_retake" }));

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(3, {}));
  });

  it("pages forward from the cursor, keeping what is already listed", async () => {
    const list = vi.fn(async () => ({
      submissions: [row({ id: 3, seat_number: "016" })],
      next_cursor: null,
    }));
    render(
      <SubmissionQueue
        courseId={3}
        initial={{ submissions: [row()], next_cursor: 99 }}
        list={list as never}
        navigate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(list).toHaveBeenCalledWith(3, { cursor: 99 }));
    await waitFor(() => expect(screen.getByText("Seat 016")).toBeTruthy());
    // The first page is still there; paging appends, it does not replace.
    expect(screen.getByText("Seat 014")).toBeTruthy();
  });

  it("invites the next action when a course has no submissions yet", () => {
    setup([]);
    expect(
      screen.getByText("No submissions yet. They appear here as students send their work."),
    ).toBeTruthy();
  });

  it("carries nothing about a student but the seat number", () => {
    const { view } = setup([row({ seat_number: "014" })]);
    const text = view.container.textContent ?? "";
    expect(text).toContain("Seat 014");
    expect(text).not.toMatch(/@/);
  });
});
