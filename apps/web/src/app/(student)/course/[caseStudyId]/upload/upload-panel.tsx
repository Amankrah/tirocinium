"use client";

// The upload surface (frontend guide 4.1): capture or drop multi-page photos,
// pre-check them on the device, reorder, then send each page straight to
// storage with its own progress and retry (decision 0019). A client island: it
// holds the page list and drives the injected orchestration controller. Bytes
// PUT direct to storage; the authed create and complete come in as bound server
// actions so the seat token never reaches here.
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Schemas } from "@/lib/api/client";
import { analyzeSharpness } from "@/lib/upload/image-quality";
import {
  type PageFileRejection,
  validatePageFile,
} from "@/lib/upload/page-checks";
import type { ProcessingState } from "@/lib/upload/processing";
import { putPage } from "@/lib/upload/put-page";
import {
  type ProcessingSubscription,
  type SubscribeProcessing,
  subscribeProcessing,
} from "@/lib/upload/subscribe-processing";
import {
  UploadController,
  type UploadDeps,
  type UploadState,
} from "@/lib/upload/upload-controller";
import { getTranscriptionAction } from "./actions";
import { strings } from "../../../strings";

// The preview renders markdown and KaTeX, so it loads in its own chunk only when
// a submission is read (guide 5), keeping the upload route's initial JS lean.
const TranscriptionPreview = dynamic(() =>
  import("./transcription-preview").then((m) => m.TranscriptionPreview),
);

// Pen capture (mode C) loads only when the student picks it, so its canvas code
// stays out of the route's initial JS.
const PenPad = dynamic(() => import("./pen-pad").then((m) => m.PenPad));

type FetchTranscription = (
  submissionId: number,
) => Promise<Schemas["TranscriptionOut"] | null>;

// The three input modes (decision 0042): photos of paper, a handwriting PDF, or
// writing on the pad. The file modes are the accessibility fallback.
type InputMode = "photos" | "pdf" | "pen";

// Below this per-page confidence a page is worth a second look.
const LOW_CONFIDENCE = 0.6;

export type CreateAction = (
  variantId: number,
  pages: Schemas["PageIn"][],
  idempotencyKey: string,
  attemptId: number | null,
) => Promise<Schemas["SubmissionCreated"] | null>;
export type CompleteAction = (submissionId: number) => Promise<boolean>;

interface SelectedPage {
  id: string;
  file: File;
  previewUrl: string;
  blurry: boolean;
}

interface Rejection {
  name: string;
  reason: PageFileRejection;
}

const s = strings.upload;

function rejectionLine(r: Rejection): string {
  if (r.reason === "type") return s.rejectedType(r.name);
  if (r.reason === "too_large") return s.rejectedTooLarge(r.name);
  return s.rejectedEmpty(r.name);
}

export function UploadPanel({
  variantId,
  caseStudyId,
  attemptId = null,
  create,
  complete,
  makeId = () => crypto.randomUUID(),
  subscribe = subscribeProcessing,
  fetchTranscription = getTranscriptionAction,
}: {
  variantId: number;
  // Only needed to link on to the defence once the work has been read.
  caseStudyId: number;
  // The attempt this submission cites, if the student started one (decision
  // 0058). Carried through untouched: no time is computed here.
  attemptId?: number | null;
  create: CreateAction;
  complete: CompleteAction;
  // Injectable so a test need not lean on crypto/URL specifics.
  makeId?: () => string;
  // Injectable so a test drives the processing stream without an EventSource.
  subscribe?: SubscribeProcessing;
  // Injectable so a test need not run the server action.
  fetchTranscription?: FetchTranscription;
}) {
  const [pages, setPages] = useState<SelectedPage[]>([]);
  const [mode, setMode] = useState<InputMode>("photos");
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [processing, setProcessing] = useState<ProcessingState | null>(null);
  const [transcription, setTranscription] =
    useState<Schemas["TranscriptionOut"] | null>(null);
  const controllerRef = useRef<UploadController | null>(null);
  const subscriptionRef = useRef<ProcessingSubscription | null>(null);

  // Close the stream if the student navigates away mid-processing.
  useEffect(() => () => subscriptionRef.current?.close(), []);

  const submitting = upload !== null && upload.phase !== "error";
  const locked = submitting;
  const submissionId = upload?.submissionId ?? null;

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const nextRejections: Rejection[] = [];
      const accepted: SelectedPage[] = [];
      for (const file of Array.from(files)) {
        const reason = validatePageFile(file);
        if (reason !== null) {
          nextRejections.push({ name: file.name, reason });
          continue;
        }
        accepted.push({
          id: makeId(),
          file,
          previewUrl:
            typeof URL !== "undefined" && "createObjectURL" in URL
              ? URL.createObjectURL(file)
              : "",
          blurry: false,
        });
      }
      setRejections(nextRejections);
      if (accepted.length > 0) {
        setPages((prev) => [...prev, ...accepted]);
        // Score sharpness off the critical path; a blurry page stays but is
        // flagged so the student can choose to retake.
        for (const page of accepted) {
          void analyzeSharpness(page.file).then((sharpness) => {
            if (sharpness === "blurry") {
              setPages((prev) =>
                prev.map((p) => (p.id === page.id ? { ...p, blurry: true } : p)),
              );
            }
          });
        }
      }
    },
    [makeId],
  );

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) void addFiles(event.target.files);
    event.target.value = "";
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer.files.length > 0) void addFiles(event.dataTransfer.files);
  };

  const remove = (id: string) =>
    setPages((prev) => prev.filter((p) => p.id !== id));

  const move = (index: number, delta: number) =>
    setPages((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      const [item] = next.splice(index, 1);
      if (item) next.splice(target, 0, item);
      return next;
    });

  const submit = async () => {
    if (pages.length === 0) return;
    const deps: UploadDeps = {
      create: (manifest, key) => create(variantId, manifest, key, attemptId),
      put: putPage,
      complete,
      newIdempotencyKey: makeId,
    };
    const controller = new UploadController(deps, setUpload);
    controllerRef.current = controller;
    await controller.run(
      pages.map((p) => ({
        manifest: {
          content_type: p.file.type as Schemas["PageIn"]["content_type"],
          size_bytes: p.file.size,
        },
        blob: p.file,
      })),
    );
    // Once the manifest is complete the worker starts; follow its progress, and
    // when it finishes reading, fetch the transcription for the preview.
    const finished = controller.getState();
    if (finished.phase === "submitted" && finished.submissionId !== null) {
      const submissionId = finished.submissionId;
      subscriptionRef.current?.close();
      subscriptionRef.current = subscribe(submissionId, (state) => {
        setProcessing(state);
        if (state.terminalStatus === "processed") {
          void fetchTranscription(submissionId).then((result) => {
            if (result) setTranscription(result);
          });
        }
      });
    }
  };

  const reset = () => {
    subscriptionRef.current?.close();
    subscriptionRef.current = null;
    controllerRef.current = null;
    setUpload(null);
    setProcessing(null);
    setTranscription(null);
    setRejections([]);
    setPages([]);
  };

  // While uploading, the upload phase drives the line; once sent, the worker's
  // stream does.
  const statusLine = useMemo(() => {
    if (processing) return null;
    if (!upload) return null;
    if (upload.phase === "submitted") return s.statusProcessing;
    if (upload.phase === "error")
      return upload.pages.some((p) => p.status === "failed")
        ? s.statusFailed
        : s.statusError;
    return s.statusUploading;
  }, [upload, processing]);

  const progressFor = (index: number) =>
    upload?.pages.find((p) => p.index === index);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-ink-muted">{s.intro}</p>

      {!locked ? (
        <div className="flex flex-col gap-4">
          <div role="group" aria-label={s.modeHint} className="flex flex-wrap gap-2">
            {(["photos", "pdf", "pen"] as const).map((option) => (
              <Button
                key={option}
                variant={mode === option ? "primary" : "quiet"}
                aria-pressed={mode === option}
                onClick={() => setMode(option)}
              >
                {option === "photos"
                  ? s.modePhotos
                  : option === "pdf"
                    ? s.modePdf
                    : s.modePen}
              </Button>
            ))}
          </div>

          {mode === "pen" ? (
            <PenPad onCapture={(file) => void addFiles([file])} />
          ) : (
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              className="flex flex-col items-center gap-3 rounded-md border-2 border-dashed border-rule-line px-6 py-10 text-center"
            >
              <p className="text-sm text-ink-muted">{s.dropPrompt}</p>
              <div className="flex flex-wrap justify-center gap-3">
                <label className="cursor-pointer">
                  <span className="sr-only">
                    {mode === "pdf" ? s.choosePdf : s.choose}
                  </span>
                  <input
                    type="file"
                    accept={
                      mode === "pdf"
                        ? "application/pdf"
                        : "image/jpeg,image/png,image/heic"
                    }
                    multiple={mode !== "pdf"}
                    onChange={onInputChange}
                    className="sr-only"
                    aria-label={mode === "pdf" ? s.choosePdf : s.choose}
                  />
                  <span className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 font-medium text-on-accent">
                    {mode === "pdf" ? s.choosePdf : s.choose}
                  </span>
                </label>
                {mode === "photos" ? (
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      onChange={onInputChange}
                      className="sr-only"
                      aria-label={s.capture}
                    />
                    <span className="inline-flex items-center justify-center rounded-md border border-rule-line px-4 py-2 font-medium text-ink">
                      {s.capture}
                    </span>
                  </label>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {rejections.length > 0 ? (
        <ul className="flex flex-col gap-1" role="alert">
          {rejections.map((r) => (
            <li key={`${r.name}-${r.reason}`} className="text-sm text-flag-amber">
              {rejectionLine(r)}
            </li>
          ))}
        </ul>
      ) : null}

      {pages.length === 0 ? (
        <p className="text-sm text-ink-muted">{s.empty}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {pages.map((page, index) => {
            const prog = progressFor(index);
            return (
              <li
                key={page.id}
                className="flex items-center gap-4 rounded-md border border-rule-line p-3"
              >
                {page.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={page.previewUrl}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="h-16 w-16 shrink-0 rounded bg-rule-line/40" />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm text-ink">
                    {s.pageLabel(index + 1)}
                  </span>
                  {page.blurry && !prog ? (
                    <span className="text-xs text-flag-amber">{s.blurry}</span>
                  ) : null}
                  {prog ? (
                    <progress
                      value={prog.fraction}
                      max={1}
                      className="h-1 w-full"
                      aria-label={s.pageLabel(index + 1)}
                    />
                  ) : null}
                </div>
                {prog?.status === "failed" ? (
                  <Button
                    variant="quiet"
                    onClick={() => controllerRef.current?.retryPage(index)}
                  >
                    {s.retry(index + 1)}
                  </Button>
                ) : null}
                {!locked ? (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label={s.moveUp(index + 1)}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      className="rounded px-2 py-1 text-ink-muted hover:text-ink disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={s.moveDown(index + 1)}
                      disabled={index === pages.length - 1}
                      onClick={() => move(index, 1)}
                      className="rounded px-2 py-1 text-ink-muted hover:text-ink disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={s.remove(index + 1)}
                      onClick={() => remove(page.id)}
                      className="rounded px-2 py-1 text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      ✕
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      <div aria-live="polite" className="min-h-6 text-sm text-ink-muted">
        {statusLine}
      </div>

      {processing ? (
        <section aria-live="polite" className="flex flex-col gap-3">
          <p className="text-sm text-ink">
            {processing.terminalStatus === "processed"
              ? s.processed
              : processing.terminalStatus === "needs_retake"
                ? s.needsRetake
                : processing.terminalStatus === "failed"
                  ? s.processFailed
                  : processing.error
                    ? s.streamLost
                    : s.reading}
          </p>
          {processing.pages.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {processing.pages.map((p) => (
                <li key={p.pageIndex} className="text-sm">
                  {p.rejected ? (
                    <span className="text-flag-amber">
                      {s.pageRetake(p.pageIndex + 1, p.rejected.message)}
                    </span>
                  ) : p.confidence !== undefined && p.confidence < LOW_CONFIDENCE ? (
                    <span className="text-flag-amber">
                      {s.pageHardToRead(p.pageIndex + 1)}
                    </span>
                  ) : (
                    <span className="text-ink-muted">{s.pageRead(p.pageIndex + 1)}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {transcription ? (
            <TranscriptionPreview
              pages={transcription.pages}
              thumbnails={pages.map((p) => p.previewUrl)}
            />
          ) : null}
          <div className="flex flex-wrap gap-3">
            {/* The defence is offered once the work has been read, and never
                gates the submission (guide 4.2): the scan stands on its own. */}
            {processing.terminalStatus === "processed" && submissionId !== null ? (
              <Link
                href={`/course/${caseStudyId}/defence/${submissionId}`}
                className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 font-medium text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {s.defend}
              </Link>
            ) : null}
            {processing.done || processing.error ? (
              <Button variant="quiet" onClick={reset}>
                {s.startOver}
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      {!submitting ? (
        <div>
          <Button onClick={() => void submit()} disabled={pages.length === 0}>
            {s.submit(pages.length)}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
