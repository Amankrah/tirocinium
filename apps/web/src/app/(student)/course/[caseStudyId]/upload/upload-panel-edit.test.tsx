import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { InkStroke } from "@/lib/upload/pen-ink";
import { putPage } from "@/lib/upload/put-page";
import type { SubscribeProcessing } from "@/lib/upload/subscribe-processing";
import type { PadEdit } from "./pen-pad";
import { UploadPanel, type CompleteAction, type CreateAction } from "./upload-panel";

// Editing a page already in the list (decision 0103). The pad draws on a
// canvas jsdom does not have, so it is stubbed with one that hands the panel a
// page and its strokes, shows what it was given to edit, and saves or cancels.
// What these hold to account: only a page written on the pad can be edited; it
// opens with its own strokes; saving replaces it where it sits and the edited
// bytes are what is sent; cancelling leaves it alone; and a send that failed
// before the edit cannot retry the old page.

const stroke = (x: number): InkStroke => ({
  tool: "pen",
  width: 3.5,
  points: [
    { x, y: 10, pressure: 0.5 },
    { x: x + 5, y: 20, pressure: 0.5 },
  ],
});

const png = (name: string, body = "png") => new File([body], name, { type: "image/png" });

vi.mock("./pen-pad", () => ({
  PenPad: ({
    onCapture,
    editing,
    onSave,
    onCancelEdit,
  }: {
    onCapture: (file: File, strokes: InkStroke[]) => void;
    editing: PadEdit | null;
    onSave: (id: string, file: File, strokes: InkStroke[]) => void;
    onCancelEdit: () => void;
  }) => (
    <div data-testid="pen-pad">
      <p>{editing ? `pad holds ${editing.label}, ${editing.strokes.length} strokes` : "pad is blank"}</p>
      <button type="button" onClick={() => onCapture(png("written.png", "first draft"), [stroke(1)])}>
        stub add
      </button>
      {editing ? (
        <>
          <button
            type="button"
            onClick={() => onSave(editing.id, png("edited.png", "corrected"), [stroke(1), stroke(9)])}
          >
            stub save
          </button>
          <button type="button" onClick={onCancelEdit}>
            stub cancel
          </button>
        </>
      ) : null}
    </div>
  ),
}));

vi.mock("./transcription-preview", () => ({ TranscriptionPreview: () => null }));

vi.mock("@/lib/upload/put-page", () => ({
  putPage: vi.fn(async (_url: string, _blob: Blob, onProgress: (f: number) => void) => {
    onProgress(1);
    return true;
  }),
}));

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

function renderPanel() {
  const create = vi.fn(async (_v: number, pages: unknown[]) => created(pages.length));
  const complete = vi.fn(async () => true);
  const subscribe = vi.fn(() => ({ close: vi.fn() }));
  let n = 0;
  render(
    <UploadPanel
      variantId={9}
      caseStudyId={3}
      create={create as unknown as CreateAction}
      complete={complete as unknown as CompleteAction}
      makeId={() => `id-${(n += 1)}`}
      subscribe={subscribe as unknown as SubscribeProcessing}
      fetchTranscription={vi.fn(async () => null)}
    />,
  );
  return { create };
}

async function addPadPage() {
  fireEvent.click(await screen.findByRole("button", { name: "stub add" }));
}

beforeEach(() => {
  let url = 0;
  Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:page-${(url += 1)}`),
    revokeObjectURL: vi.fn(),
  });
  window.requestAnimationFrame = (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  };
});

afterEach(() => vi.clearAllMocks());

describe("editing a page already in the list", () => {
  it("offers to edit a page written on the pad, and opens it with its own strokes", async () => {
    renderPanel();
    await addPadPage();
    expect(await screen.findByText("Page 1")).toBeDefined();
    expect(screen.getByText("pad is blank")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Edit page 1" }));

    expect(await screen.findByText("pad holds Page 1, 1 strokes")).toBeDefined();
    expect(screen.getByRole("button", { name: "Edit page 1" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("status").textContent).toContain("Editing page 1");
  });

  it("does not offer to edit a photograph, which has no strokes to reopen", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Photos of paper" }));
    fireEvent.change(screen.getByLabelText("Choose photos"), {
      target: { files: [new File(["jpg"], "a.jpg", { type: "image/jpeg" })] },
    });
    expect(await screen.findByText("Page 1")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Edit page 1" })).toBeNull();
  });

  it("replaces the page where it sits, and sends the edited page", async () => {
    const { create } = renderPanel();
    await addPadPage();
    await addPadPage();
    await screen.findByText("Page 2");

    fireEvent.click(screen.getByRole("button", { name: "Edit page 1" }));
    fireEvent.click(await screen.findByRole("button", { name: "stub save" }));

    expect(await screen.findByText("pad is blank")).toBeDefined();
    expect(screen.getAllByText(/^Page \d$/)).toHaveLength(2);
    // The old preview is let go, not leaked.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:page-1");

    fireEvent.click(screen.getByRole("button", { name: /Send 2 pages/ }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(putPage).toHaveBeenCalledTimes(2));
    const sent = vi.mocked(putPage).mock.calls.map(([url, blob]) => [url, blob as File]);
    const first = sent.find(([url]) => String(url).endsWith("/0"))![1] as File;
    expect(first.name).toBe("edited.png");
    expect(await first.text()).toBe("corrected");
  });

  it("keeps the page as it was when the change is cancelled", async () => {
    renderPanel();
    await addPadPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit page 1" }));
    fireEvent.click(await screen.findByRole("button", { name: "stub cancel" }));

    expect(await screen.findByText("pad is blank")).toBeDefined();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Edit page 1" }));
    expect(await screen.findByText("pad holds Page 1, 1 strokes")).toBeDefined();
  });

  it("waits for an open change before sending, and says why", async () => {
    renderPanel();
    await addPadPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit page 1" }));

    const send = screen.getByRole("button", { name: /Send 1 page/ });
    expect(send.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Save or cancel your changes to page 1 before sending.")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "stub cancel" }));
    await waitFor(() => expect(send.hasAttribute("disabled")).toBe(false));
  });

  it("ends the edit when the page being edited is removed", async () => {
    renderPanel();
    await addPadPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit page 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove page 1" }));

    expect(await screen.findByText("pad is blank")).toBeDefined();
    expect(screen.queryByText("Page 1")).toBeNull();
  });

  it("drops a failed send's retries once a page is changed, so the old page cannot be retried", async () => {
    vi.mocked(putPage).mockResolvedValue(false);
    const { create } = renderPanel();
    await addPadPage();
    fireEvent.click(await screen.findByRole("button", { name: /Send 1 page/ }));
    const retry = await screen.findByRole("button", { name: "Retry page 1" });
    expect(retry).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Edit page 1" }));
    fireEvent.click(await screen.findByRole("button", { name: "stub save" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Retry page 1" })).toBeNull());
    vi.mocked(putPage).mockImplementation(async (_url, _blob, onProgress) => {
      onProgress(1);
      return true;
    });
    const list = screen.getByRole("list");
    expect(within(list).getByText("Page 1")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Send 1 page/ }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    const last = vi.mocked(putPage).mock.calls.at(-1)![1] as File;
    expect(last.name).toBe("edited.png");
  });
});
