import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/lib/api/client";
import type { ProcessingState } from "@/lib/upload/processing";
import type { SubscribeProcessing } from "@/lib/upload/subscribe-processing";
import {
  UploadPanel,
  type CompleteAction,
  type CreateAction,
} from "./upload-panel";

// Stub the lazily-loaded preview: the panel test proves the panel fetches and
// hands off the reading; the preview's own rendering is covered by its test.
vi.mock("./transcription-preview", () => ({
  TranscriptionPreview: (props: { pages: unknown[] }) => (
    <div data-testid="preview">{`preview:${props.pages.length}`}</div>
  ),
}));
// Stub the lazily-loaded pen pad (canvas is a browser API).
vi.mock("./pen-pad", () => ({
  PenPad: () => <div data-testid="pen-pad">pad</div>,
}));

function transcription(): Schemas["TranscriptionOut"] {
  return {
    submission_id: 42,
    status: "processed",
    recognition_conf: 0.8,
    recognized_markdown: "read",
    pages: [
      {
        page_index: 0,
        markdown: "read",
        confidence: 0.8,
        quality_status: "ok",
        reject_reason: null,
        regions: [],
      },
    ],
  };
}

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
  const fetchTranscription = vi.fn(async () => transcription());
  let n = 0;
  render(
    <UploadPanel
      variantId={9}
      caseStudyId={3}
      create={create as unknown as CreateAction}
      complete={complete as unknown as CompleteAction}
      makeId={() => `id-${(n += 1)}`}
      subscribe={subscribe as unknown as SubscribeProcessing}
      fetchTranscription={fetchTranscription}
    />,
  );
  return { create, complete, subscribe, emit, fetchTranscription };
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

  it("offers the three input modes and switches between them", async () => {
    renderPanel();
    // Photos is the default: the photo choosers are shown.
    expect(screen.getByLabelText("Choose photos")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Handwriting PDF" }));
    expect(screen.getByLabelText("Choose a PDF")).toBeDefined();
    expect(screen.queryByLabelText("Choose photos")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Write here" }));
    expect(await screen.findByTestId("pen-pad")).toBeDefined();
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
      // No attempt was carried in, so none is cited (decision 0058).
      null,
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

  // The defence is offered once the work has been read and never gates the
  // submission (guide 4.2): the scan stands on its own.
  it("offers the defence only once the pages have been read", async () => {
    const { emit } = renderPanel();
    choose([jpeg("page-a.jpg")]);
    await screen.findByText("Page 1");
    fireEvent.click(screen.getByRole("button", { name: "Send 1 page" }));
    await waitFor(() => expect(emit.current).not.toBeNull());

    act(() => emit.current?.(processingState({ status: "processing" })));
    expect(screen.queryByRole("link", { name: "Talk it through" })).toBeNull();

    act(() =>
      emit.current?.(
        processingState({ status: "processed", done: true, terminalStatus: "processed" }),
      ),
    );
    expect(
      screen.getByRole("link", { name: "Talk it through" }).getAttribute("href"),
    ).toBe("/course/3/defence/42");
  });

  it("does not offer the defence when pages need a retake", async () => {
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
        }),
      ),
    );
    expect(screen.queryByRole("link", { name: "Talk it through" })).toBeNull();
  });

  it("fetches the transcription on processed and renders the preview", async () => {
    const { emit, fetchTranscription } = renderPanel();
    choose([jpeg("page-a.jpg")]);
    await screen.findByText("Page 1");
    fireEvent.click(screen.getByRole("button", { name: "Send 1 page" }));
    await waitFor(() => expect(emit.current).not.toBeNull());

    act(() =>
      emit.current?.(
        processingState({ status: "processed", done: true, terminalStatus: "processed" }),
      ),
    );

    await waitFor(() => expect(fetchTranscription).toHaveBeenCalledWith(42));
    expect((await screen.findByTestId("preview")).textContent).toBe("preview:1");
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

  // The attempt span (decision 0058): the id arrives from the problem view's
  // start moment through the URL, and is passed along untouched.
  it("cites the attempt it was given when the submission is created", async () => {
    const create = vi.fn(async () => created(1));
    const emit: { current: ((s: ProcessingState) => void) | null } = { current: null };
    render(
      <UploadPanel
        variantId={9}
        caseStudyId={3}
        attemptId={77}
        create={create as unknown as CreateAction}
        complete={(async () => true) as unknown as CompleteAction}
        makeId={() => "id-1"}
        subscribe={((_id: number, onState: (s: ProcessingState) => void) => {
          emit.current = onState;
          return { close: vi.fn() };
        }) as unknown as SubscribeProcessing}
        fetchTranscription={vi.fn(async () => transcription())}
      />,
    );

    choose([jpeg("page-a.jpg")]);
    await screen.findByText("Page 1");
    fireEvent.click(screen.getByRole("button", { name: "Send 1 page" }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        9,
        [{ content_type: "image/jpeg", size_bytes: 4 }],
        expect.any(String),
        77,
      ),
    );
  });
});
