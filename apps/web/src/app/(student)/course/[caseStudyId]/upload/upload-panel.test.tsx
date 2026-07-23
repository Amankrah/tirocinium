import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProcessingState } from "@/lib/upload/processing";
import type { SubscribeProcessing } from "@/lib/upload/subscribe-processing";
import {
  UploadPanel,
  type CompleteAction,
  type CreateAction,
} from "./upload-panel";

// The direct-to-storage PUT is browser XHR; stub it so the panel's wiring is
// tested without a network. Report full progress and succeed.
vi.mock("@/lib/upload/put-page", () => ({
  putPage: vi.fn(async (_url: string, _blob: Blob, onProgress: (f: number) => void) => {
    onProgress(1);
    return true;
  }),
}));
// The blur analysis needs a canvas; keep it deterministic and off the canvas.
vi.mock("@/lib/upload/image-quality", () => ({
  analyzeSharpness: vi.fn(async () => "sharp" as const),
}));

function created(count: number) {
  return {
    submission_id: 42,
    status: "pending",
    storage_prefix: "scans/1/x",
    uploads: Array.from({ length: count }, (_, i) => ({
      page_index: i,
      storage_key: `scans/1/x/${i}`,
      url: `https://minio/put/${i}`,
    })),
  };
}

function renderPanel(
  over: { create?: CreateAction; complete?: CompleteAction } = {},
) {
  const create = vi.fn(over.create ?? (async () => created(1)));
  const complete = vi.fn(over.complete ?? (async () => true));
  // Capture the stream callback so a test can drive processing states by hand.
  const emit: { current: ((s: ProcessingState) => void) | null } = { current: null };
  const close = vi.fn();
  const subscribe = vi.fn((_id: number, onState: (s: ProcessingState) => void) => {
    emit.current = onState;
    return { close };
  });
  let n = 0;
  render(
    <UploadPanel
      variantId={9}
      create={create as unknown as CreateAction}
      complete={complete as unknown as CompleteAction}
      makeId={() => `id-${(n += 1)}`}
      subscribe={subscribe as unknown as SubscribeProcessing}
    />,
  );
  return { create, complete, subscribe, emit };
}

function processingState(over: Partial<ProcessingState>): ProcessingState {
  return {
    status: "processing",
    pages: [],
    done: false,
    terminalStatus: null,
    error: false,
    ...over,
  };
}

const jpeg = (name: string) => new File(["data"], name, { type: "image/jpeg" });

function choose(files: File[]) {
  const input = screen.getByLabelText("Choose photos");
  fireEvent.change(input, { target: { files } });
}

afterEach(() => vi.clearAllMocks());

describe("UploadPanel", () => {
  it("starts empty with the submit disabled", () => {
    renderPanel();
    expect(screen.getByText("No pages yet. Add photos of your handwritten work.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Send 0 pages" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("adds an accepted photo as a page and enables submit", async () => {
    renderPanel();
    choose([jpeg("page-a.jpg")]);
    expect(await screen.findByText("Page 1")).toBeDefined();
    expect(screen.getByRole("button", { name: "Send 1 page" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("leaves an unsupported file out with an honest line", async () => {
    renderPanel();
    choose([new File(["z"], "notes.zip", { type: "application/zip" })]);
    expect(
      await screen.findByText("notes.zip is not a photo or PDF, so it was left out."),
    ).toBeDefined();
    expect(screen.queryByText("Page 1")).toBeNull();
  });

  it("runs create, upload, and complete on send, then subscribes to progress", async () => {
    const { create, complete, subscribe } = renderPanel();
    choose([jpeg("page-a.jpg")]);
    await screen.findByText("Page 1");

    fireEvent.click(screen.getByRole("button", { name: "Send 1 page" }));

    await waitFor(() =>
      expect(screen.getByText("Sent. We are reading your pages now.")).toBeDefined(),
    );
    expect(create).toHaveBeenCalledWith(
      9,
      [{ content_type: "image/jpeg", size_bytes: 4 }],
      expect.any(String),
    );
    expect(complete).toHaveBeenCalledWith(42);
    // The worker's stream is followed for the submission just completed.
    expect(subscribe).toHaveBeenCalledWith(42, expect.any(Function));
  });

  it("shows the read outcome when processing reaches processed", async () => {
    const { emit } = renderPanel();
    choose([jpeg("page-a.jpg")]);
    await screen.findByText("Page 1");
    fireEvent.click(screen.getByRole("button", { name: "Send 1 page" }));
    await waitFor(() => expect(emit.current).not.toBeNull());

    act(() =>
      emit.current?.(
        processingState({
          status: "processed",
          done: true,
          terminalStatus: "processed",
          pages: [{ pageIndex: 0, confidence: 0.9 }],
        }),
      ),
    );

    expect(screen.getByText("We have read all your pages.")).toBeDefined();
    expect(screen.getByText("Page 1 read")).toBeDefined();
    expect(screen.getByRole("button", { name: "Start a new upload" })).toBeDefined();
  });

  it("surfaces a rejected page's retake message on needs_retake", async () => {
    const { emit } = renderPanel();
    choose([jpeg("page-a.jpg")]);
    await screen.findByText("Page 1");
    fireEvent.click(screen.getByRole("button", { name: "Send 1 page" }));
    await waitFor(() => expect(emit.current).not.toBeNull());

    act(() =>
      emit.current?.(
        processingState({
          status: "needs_retake",
          done: true,
          terminalStatus: "needs_retake",
          pages: [
            {
              pageIndex: 0,
              rejected: { reason: "too_dark", message: "is too dark, please retake it" },
            },
          ],
        }),
      ),
    );

    expect(screen.getByText("Page 1 is too dark, please retake it")).toBeDefined();
  });

  it("removes a page from the list", async () => {
    renderPanel();
    choose([jpeg("a.jpg"), jpeg("b.jpg")]);
    await screen.findByText("Page 2");

    fireEvent.click(screen.getByRole("button", { name: "Remove page 1" }));

    await waitFor(() => expect(screen.queryByText("Page 2")).toBeNull());
    expect(screen.getByText("Page 1")).toBeDefined();
  });
});
