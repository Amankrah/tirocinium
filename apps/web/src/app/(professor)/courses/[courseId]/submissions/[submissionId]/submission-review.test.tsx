import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/lib/api/client";
import { regionRect, SubmissionReview } from "./submission-review";

function page(over: Partial<Schemas["ReviewPageOut"]> = {}): Schemas["ReviewPageOut"] {
  return {
    page_index: 0,
    image_url: "https://minio/original-0.png",
    grayscale_url: "https://minio/grayscale-0.png",
    markdown: "I = V/R",
    confidence: 0.9,
    quality_status: "ok",
    reject_reason: null,
    regions: [
      { bbox: [0.1, 0.1, 0.9, 0.3], confidence: 0.95, text: "I = V/R" },
      { bbox: [0.1, 0.4, 0.6, 0.5], confidence: 0.42, text: "I = 2.553 mA" },
    ],
    ...over,
  };
}

function review(
  over: Partial<Schemas["SubmissionReviewOut"]> = {},
): Schemas["SubmissionReviewOut"] {
  return {
    id: 7,
    seat_number: "014",
    case_study_id: 3,
    case_study_title: "Pump sizing",
    variant_id: 9,
    status: "processed",
    submitted_at: 1_700_000_000,
    recognition_conf: 0.81,
    recognized_markdown: "I = V/R",
    grade: null,
    graded_at: null,
    pages: [page()],
    ...over,
  };
}

function setup(over: Partial<Schemas["SubmissionReviewOut"]> = {}) {
  const refresh = vi.fn(async () => ({
    page_index: 0,
    image_url: "https://minio/fresh-original.png",
    grayscale_url: "https://minio/fresh-grayscale.png",
  }));
  const grade = vi.fn(async (_c: number, _s: number, score: number) => ({
    submission_id: 7,
    score,
    graded_at: 1_700_000_100,
  }));
  const view = render(
    <SubmissionReview
      courseId={3}
      review={review(over)}
      refresh={refresh}
      grade={grade}
    />,
  );
  return { refresh, grade, view };
}

describe("regionRect", () => {
  // A region's bbox is [x0, y0, x1, y1], the opposite convention from a
  // figure's [x, y, w, h], so this is worth pinning rather than assuming.
  it("turns two corners into a percentage rectangle", () => {
    expect(regionRect([0.1, 0.2, 0.6, 0.5])).toEqual({
      left: "10%",
      top: "20%",
      width: "50%",
      height: "30%",
    });
  });

  it("normalises corners given in either order", () => {
    expect(regionRect([0.6, 0.5, 0.1, 0.2])).toEqual(regionRect([0.1, 0.2, 0.6, 0.5]));
  });

  it("clamps a box that runs off the page", () => {
    expect(regionRect([-0.5, -0.5, 1.5, 1.5])).toEqual({
      left: "0%",
      top: "0%",
      width: "100%",
      height: "100%",
    });
  });
});

describe("the submission review surface", () => {
  it("shows the rendition the model read by default, and says so", () => {
    setup();
    const image = screen.getByRole("presentation", { hidden: true }) as HTMLImageElement;
    expect(image.src).toContain("grayscale-0.png");
    expect(
      screen.getByText(
        "Boxes are drawn on the page the model read, which is straightened and cleaned. The original photo is the other view.",
      ),
    ).toBeTruthy();
  });

  it("switches to the original photo and drops the boxes with it", () => {
    const { view } = setup();
    expect(view.container.querySelectorAll("span[aria-hidden='true']")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Original photo" }));

    const image = screen.getByRole("presentation", { hidden: true }) as HTMLImageElement;
    expect(image.src).toContain("original-0.png");
    // Boxes only line up on the rendition, so they are not drawn here.
    expect(view.container.querySelectorAll("span[aria-hidden='true']")).toHaveLength(0);
  });

  it("marks the low-confidence region in the text and never hides it", () => {
    setup();
    const low = screen.getByRole("button", { name: /I = 2\.553 mA/ });
    expect(low.textContent).toContain("42% sure");
    expect(low.textContent).toContain("Less certain here");
    // The confident one is present and unmarked.
    expect(screen.getByRole("button", { name: /I = V\/R/ }).textContent).not.toContain(
      "Less certain here",
    );
  });

  it("links a reading line to its box from the keyboard, not only the pointer", () => {
    const { view } = setup();
    const line = screen.getByRole("button", { name: /I = 2\.553 mA/ });

    fireEvent.focus(line);
    const boxes = view.container.querySelectorAll("span[aria-hidden='true']");
    expect(boxes[1]?.className).toContain("bg-accent/15");
    expect(boxes[0]?.className).not.toContain("bg-accent/15");

    fireEvent.blur(line);
    expect(
      view.container.querySelectorAll("span[aria-hidden='true']")[1]?.className,
    ).not.toContain("bg-accent/15");
  });

  it("links the other direction, from the box to its line", () => {
    const { view } = setup();
    const boxes = view.container.querySelectorAll("span[aria-hidden='true']");
    fireEvent.mouseEnter(boxes[0]!);
    expect(screen.getByRole("button", { name: /I = V\/R/ }).className).toContain(
      "bg-accent/10",
    );
  });

  it("offers a reload when a presigned link has expired, rather than a broken page", async () => {
    const { refresh } = setup();
    fireEvent.error(screen.getByRole("presentation", { hidden: true }));

    expect(screen.getByText("That image link expired. Reload it.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reload this page image" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledWith(3, 7, 0));
    await waitFor(() => {
      const image = screen.getByRole("presentation", { hidden: true }) as HTMLImageElement;
      expect(image.src).toContain("fresh-grayscale.png");
    });
  });

  it("says a page was rejected in the words the pipeline gave", () => {
    setup({ pages: [page({ reject_reason: "is too dark to read", regions: [] })] });
    expect(screen.getByText("This page was rejected: is too dark to read")).toBeTruthy();
  });

  it("falls back to the page reading when there are no regions", () => {
    setup({ pages: [page({ regions: [], markdown: "I = V/R" })] });
    expect(screen.getByText("I = V/R")).toBeTruthy();
  });

  it("says plainly when nothing has been read", () => {
    setup({ pages: [], status: "processing" });
    expect(
      screen.getByText("This submission has not been read yet, so there is nothing to check."),
    ).toBeTruthy();
  });
});

describe("grading", () => {
  it("sends the score as a fraction and confirms what was saved", async () => {
    const { grade } = setup();
    fireEvent.change(screen.getByLabelText("Score out of 100"), {
      target: { value: "80" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save grade" }));

    await waitFor(() => expect(grade).toHaveBeenCalledWith(3, 7, 0.8));
    await waitFor(() => expect(screen.getByText("Saved 80%.")).toBeTruthy());
  });

  it("says what a grade does, because it supersedes the platform's own evidence", () => {
    setup();
    expect(
      screen.getByText(
        "A grade you give outweighs what the platform inferred, on every concept this case study covers.",
      ),
    ).toBeTruthy();
  });

  it("refuses a score outside the range without calling the server", () => {
    const { grade } = setup();
    fireEvent.change(screen.getByLabelText("Score out of 100"), {
      target: { value: "140" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save grade" }));

    expect(grade).not.toHaveBeenCalled();
    expect(screen.getByText("A grade is between 0 and 100.")).toBeTruthy();
  });

  it("opens on the grade already given, so a regrade starts from the truth", () => {
    setup({ grade: 0.65 });
    expect((screen.getByLabelText("Score out of 100") as HTMLInputElement).value).toBe(
      "65",
    );
    expect(screen.getByText("Saved 65%.")).toBeTruthy();
  });

  it("says so when the grade does not save", async () => {
    const refresh = vi.fn(async () => null);
    const grade = vi.fn(async () => null);
    render(
      <SubmissionReview courseId={3} review={review()} refresh={refresh} grade={grade} />,
    );
    fireEvent.change(screen.getByLabelText("Score out of 100"), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save grade" }));

    await waitFor(() =>
      expect(screen.getByText("That grade did not save. Try again.")).toBeTruthy(),
    );
  });
});
