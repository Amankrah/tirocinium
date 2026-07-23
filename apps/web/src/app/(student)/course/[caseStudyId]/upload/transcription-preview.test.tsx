import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Schemas } from "@/lib/api/client";
import { TranscriptionPreview } from "./transcription-preview";

function page(over: Partial<Schemas["PageReadingOut"]>): Schemas["PageReadingOut"] {
  return {
    page_index: 0,
    markdown: "",
    confidence: 0.9,
    quality_status: "ok",
    reject_reason: null,
    regions: [],
    ...over,
  };
}

describe("TranscriptionPreview", () => {
  it("renders the recognised markdown beside the page", () => {
    render(
      <TranscriptionPreview
        pages={[page({ markdown: "Newton's second law gives the force." })]}
        thumbnails={["blob:page-0"]}
      />,
    );
    expect(
      screen.getByText("Newton's second law gives the force."),
    ).toBeDefined();
    expect(screen.getByText("Page 1")).toBeDefined();
  });

  it("typesets math through KaTeX", () => {
    const { container } = render(
      <TranscriptionPreview
        pages={[page({ markdown: "The relation is $E = mc^2$." })]}
        thumbnails={["blob:page-0"]}
      />,
    );
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("surfaces low-confidence spans with the check prompt", () => {
    render(
      <TranscriptionPreview
        pages={[
          page({
            markdown: "The integral evaluates to two thirds.",
            regions: [
              { bbox: [0, 0, 0.5, 0.1], confidence: 0.95, text: "The integral" },
              { bbox: [0, 0.1, 0.5, 0.1], confidence: 0.3, text: "two thirds" },
            ],
          }),
        ]}
        thumbnails={["blob:page-0"]}
      />,
    );
    expect(
      screen.getByText("Check the highlighted lines match what you wrote."),
    ).toBeDefined();
    expect(screen.getByText("two thirds")).toBeDefined();
    // The confident region is not flagged.
    expect(screen.queryByText("The integral", { selector: "mark" })).toBeNull();
  });

  it("shows no check prompt when every region is confident", () => {
    render(
      <TranscriptionPreview
        pages={[
          page({
            markdown: "All clear.",
            regions: [{ bbox: [0, 0, 1, 1], confidence: 0.9, text: "All clear" }],
          }),
        ]}
        thumbnails={["blob:page-0"]}
      />,
    );
    expect(
      screen.queryByText("Check the highlighted lines match what you wrote."),
    ).toBeNull();
  });
});
