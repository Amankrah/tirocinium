import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImportPanel } from "./import-panel";

// The direct-to-storage PUT is browser XHR; stub it so the panel's wiring is
// tested without a network.
vi.mock("@/lib/upload/put-page", () => ({
  putPage: vi.fn(async (_url: string, _blob: Blob, onProgress: (f: number) => void) => {
    onProgress(1);
    return true;
  }),
}));

function created() {
  return {
    import_id: 7,
    status: "pending",
    storage_key: "imports/1/x/source.pdf",
    upload_url: "https://minio/put",
  };
}

function job(
  status: string,
  pageCount: number | null = null,
  extra: { pages_done?: number; stage?: "opening" | "reading" | "segmenting" | null } = {},
) {
  return {
    id: 7,
    status,
    page_count: pageCount,
    pages_done: extra.pages_done ?? (pageCount ?? 0),
    stage: extra.stage ?? null,
    created_at: 1,
  };
}

function renderPanel() {
  const create = vi.fn(async () => created());
  const complete = vi.fn(async () => true);
  const poll = vi.fn(async () => job("ready", 12));
  render(
    <ImportPanel
      courseId={1}
      create={create as never}
      complete={complete as never}
      poll={poll as never}
      makeId={() => "key-1"}
    />,
  );
  return { create, complete, poll };
}

const pdf = (name: string, type = "application/pdf") =>
  new File(["%PDF-1.4"], name, { type });

function choose(file: File) {
  fireEvent.change(screen.getByLabelText("Choose a PDF"), {
    target: { files: [file] },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("ImportPanel", () => {
  it("shows the drop target and the choose control", () => {
    renderPanel();
    expect(screen.getByLabelText("Choose a PDF")).toBeDefined();
    expect(screen.getByText("Drag a PDF here, or")).toBeDefined();
  });

  it("rejects a non-pdf with an honest line and offers no import", () => {
    renderPanel();
    choose(pdf("notes.png", "image/png"));
    expect(screen.getByRole("alert").textContent).toBe("That file is not a PDF.");
    expect(screen.queryByRole("button", { name: "Import this PDF" })).toBeNull();
  });

  it("accepts a pdf and shows its name with the import action", () => {
    renderPanel();
    choose(pdf("problems.pdf"));
    expect(screen.getByText("problems.pdf")).toBeDefined();
    expect(screen.getByRole("button", { name: "Import this PDF" })).toBeDefined();
  });

  it("runs create, upload, complete, and poll to ready, then invites the next step", async () => {
    const { create, complete, poll } = renderPanel();
    choose(pdf("problems.pdf"));
    fireEvent.click(screen.getByRole("button", { name: "Import this PDF" }));

    await waitFor(() => expect(screen.getByText("Read 12 pages.")).toBeDefined());
    expect(create).toHaveBeenCalledWith(1, pdf("problems.pdf").size, "key-1");
    expect(complete).toHaveBeenCalledWith(1, 7);
    expect(poll).toHaveBeenCalledWith(1, 7);
    // Links into the confirmation surface for the import just read.
    const review = screen.getByRole("link", { name: "Review the extracted problems" });
    expect(review.getAttribute("href")).toBe("/courses/1/imports/7");
  });

  it("names how long a finished import took", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const create = vi.fn(async () => created());
    const complete = vi.fn(async () => true);
    const poll = vi.fn(async () => {
      now += 105_000;
      return job("ready", 12);
    });
    render(
      <ImportPanel
        courseId={1}
        create={create as never}
        complete={complete as never}
        poll={poll as never}
        makeId={() => "key-1"}
      />,
    );
    choose(pdf("problems.pdf"));
    fireEvent.click(screen.getByRole("button", { name: "Import this PDF" }));

    await waitFor(() =>
      expect(screen.getByText("That took 1 min 45 s.")).toBeDefined(),
    );
  });

  it("names the live stage while the worker is still reading", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const create = vi.fn(async () => created());
    const complete = vi.fn(async () => true);
    const poll = vi
      .fn()
      .mockResolvedValue(job("processing", 9, { pages_done: 3, stage: "reading" }));
    render(
      <ImportPanel
        courseId={1}
        create={create as never}
        complete={complete as never}
        poll={poll as never}
        delay={() => gate}
        makeId={() => "key-1"}
      />,
    );
    choose(pdf("problems.pdf"));
    fireEvent.click(screen.getByRole("button", { name: "Import this PDF" }));

    await waitFor(() =>
      expect(screen.getByText("Reading page 3 of 9")).toBeDefined(),
    );
    expect(screen.getByText("Extracting figures")).toBeDefined();
    expect(screen.getByText("Finding questions and solutions")).toBeDefined();
    const pages = document.querySelector("progress");
    expect(pages?.getAttribute("value")).toBe("3");
    expect(pages?.getAttribute("max")).toBe("9");

    poll.mockResolvedValue(job("ready", 9, { pages_done: 9, stage: null }));
    release();
    await waitFor(() => expect(screen.getByText("Read 9 pages.")).toBeDefined());
  });

  it("surfaces an error when create is refused", async () => {
    const create = vi.fn(async () => null);
    const complete = vi.fn(async () => true);
    const poll = vi.fn(async () => job("ready", 1));
    render(
      <ImportPanel
        courseId={1}
        create={create as never}
        complete={complete as never}
        poll={poll as never}
        makeId={() => "key-1"}
      />,
    );
    choose(pdf("problems.pdf"));
    fireEvent.click(screen.getByRole("button", { name: "Import this PDF" }));

    await waitFor(() =>
      expect(
        screen.getByText("That did not work. Check your connection and try again."),
      ).toBeDefined(),
    );
  });
});
