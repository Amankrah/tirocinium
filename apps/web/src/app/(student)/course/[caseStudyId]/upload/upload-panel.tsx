"use client";

// The upload surface (frontend guide 4.1): capture or drop multi-page photos,
// pre-check them on the device, reorder, then send each page straight to
// storage with its own progress and retry (decision 0019). A client island: it
// holds the page list and drives the injected orchestration controller. Bytes
// PUT direct to storage; the authed create and complete come in as bound server
// actions so the seat token never reaches here.
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon, type IconName } from "@/components/ui/icon";
import type { Schemas } from "@/lib/api/client";
import { analyzeSharpness } from "@/lib/upload/image-quality";
import type { InkStroke } from "@/lib/upload/pen-ink";
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
import type { PadEdit } from "./pen-pad";
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

const MODES: { mode: InputMode; icon: IconName }[] = [
  { mode: "pen", icon: "pen" },
  { mode: "photos", icon: "camera" },
  { mode: "pdf", icon: "file" },
];

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
  // The strokes a page written on the pad was drawn from, so it can be opened
  // on the pad again and changed (decision 0103). A photograph or a PDF page
  // has none, and is replaced by removing it and adding another.
  ink?: InkStroke[];
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

function modeLabel(mode: InputMode): string {
  if (mode === "photos") return s.modePhotos;
  if (mode === "pdf") return s.modePdf;
  return s.modePen;
}

// The segmented control's segments (decision 0102): real buttons in a sunken
// track, the chosen one lifted onto the surface. Hand-rolled rather than the
// Button primitive because the quiet variant's hover fill is the track's own
// colour and would vanish on it.
const segmentBase =
  "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3.5 text-sm whitespace-nowrap " +
  "transition-[background-color,color,box-shadow] duration-(--motion-duration) ease-(--motion-ease) focus-ring";
const segmentOn = "bg-surface font-medium text-ink shadow-raised";
const segmentOff = "text-ink-muted hover:text-ink";

// An icon-only control in the page row (reorder, remove): the label is the
// accessible name, the glyph is what a sighted student sees.
const rowControl = buttonClassName("quiet", "text-ink-muted hover:text-ink", "sm");

// What the worker is doing, in the order it actually does it. "sent" is done
// the moment the pages have left the device. Checking is the preprocess pass,
// reading is the transcription, and comparing is the answer and working check
// that runs once the pages have been read.
type MarkingStep = "checking" | "reading" | "comparing";

const MARKING_STEPS: { id: "sent" | MarkingStep; label: string }[] = [
  { id: "sent", label: s.stepSent },
  { id: "checking", label: s.stepChecking },
  { id: "reading", label: s.stepReading },
  { id: "comparing", label: s.stepComparing },
];

function markingStep(processing: ProcessingState | null): MarkingStep {
  if (processing?.terminalStatus === "processed") return "comparing";
  if (processing && processing.pages.length > 0) return "reading";
  return "checking";
}

// The processing state as a raised sheet: the one object on the page while the
// worker runs. The live step carries the progress shimmer (guide 3.3), the
// done ones a check, the waiting ones stay quiet.
function MarkingSteps({ current }: { current: MarkingStep }) {
  const order = ["sent", "checking", "reading", "comparing"] as const;
  const currentAt = order.indexOf(current);
  return (
    <Card
      as="section"
      tone="raised"
      aria-live="polite"
      aria-busy="true"
      className="flex flex-col gap-3"
    >
      <ol className="flex flex-col">
        {MARKING_STEPS.map((step, index) => {
          const state = index < currentAt ? "done" : index === currentAt ? "current" : "waiting";
          return (
            <li
              key={step.id}
              aria-current={state === "current" ? "step" : undefined}
              className={
                state === "current"
                  ? "progress-shimmer relative flex items-center gap-2 overflow-hidden border-l-2 border-l-accent py-2 pl-3 text-sm font-medium text-ink"
                  : state === "done"
                    ? "flex items-center gap-2 border-l-2 border-l-rule-line py-2 pl-3 text-sm text-ink-muted"
                    : "flex items-center gap-2 border-l-2 border-l-transparent py-2 pl-3 text-sm text-ink-muted"
              }
            >
              {state === "done" ? (
                <Icon name="check" size={14} className="text-verify-green" />
              ) : null}
              {step.label}
            </li>
          );
        })}
      </ol>
    </Card>
  );
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
  const [mode, setMode] = useState<InputMode>("pen");
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [processing, setProcessing] = useState<ProcessingState | null>(null);
  const [transcription, setTranscription] =
    useState<Schemas["TranscriptionOut"] | null>(null);
  // The read is back, whether or not a transcription came with it. Until then
  // the comparing step stays current: that is when the worker checks the
  // answer and the working, after the pages have been read.
  const [markingSettled, setMarkingSettled] = useState(false);
  const controllerRef = useRef<UploadController | null>(null);
  const subscriptionRef = useRef<ProcessingSubscription | null>(null);

  // Close the stream if the student navigates away mid-processing.
  useEffect(() => () => subscriptionRef.current?.close(), []);

  const submitting = upload !== null && upload.phase !== "error";
  const locked = submitting;
  const submissionId = upload?.submissionId ?? null;

  // The pad page being changed, if any (decision 0103).
  const [editingId, setEditingId] = useState<string | null>(null);
  const padRef = useRef<HTMLDivElement>(null);

  // A send that failed part-way holds the pages as they were when it started,
  // and its retry re-sends page N of that list. Once the list changes (a page
  // edited, moved, removed or added) those retries would send the wrong
  // thing, so the failed attempt is let go and Send starts a fresh one from
  // the pages on screen.
  const forgetFailedSend = useCallback(() => {
    if (upload?.phase !== "error") return;
    controllerRef.current = null;
    setUpload(null);
  }, [upload]);

  const previewOf = (file: File) =>
    typeof URL !== "undefined" && "createObjectURL" in URL ? URL.createObjectURL(file) : "";

  const flagIfBlurry = (page: { id: string; file: File }) => {
    // Score sharpness off the critical path; a blurry page stays but is
    // flagged so the student can choose to retake.
    void analyzeSharpness(page.file).then((sharpness) => {
      if (sharpness === "blurry") {
        setPages((prev) => prev.map((p) => (p.id === page.id ? { ...p, blurry: true } : p)));
      }
    });
  };

  const addFiles = useCallback(
    // `ink` travels with a single page written on the pad.
    async (files: FileList | File[], ink?: InkStroke[]) => {
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
          previewUrl: previewOf(file),
          blurry: false,
          ...(ink ? { ink } : {}),
        });
      }
      setRejections(nextRejections);
      if (accepted.length > 0) {
        forgetFailedSend();
        setPages((prev) => [...prev, ...accepted]);
        for (const page of accepted) flagIfBlurry(page);
      }
    },
    [makeId, forgetFailedSend],
  );

  // Open a pad page to change it: the pad, with its strokes, in view.
  const edit = (id: string) => {
    setMode("pen");
    setEditingId(id);
    setRejections([]);
    requestAnimationFrame(() => {
      const pad = padRef.current;
      if (pad && typeof pad.scrollIntoView === "function") {
        pad.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  };

  // The changed page takes the old one's place, at the same position, with
  // the same id; only its pixels, its strokes and its preview are new.
  const savePage = (id: string, file: File, ink: InkStroke[]) => {
    const reason = validatePageFile(file);
    if (reason !== null) {
      setRejections([{ name: file.name, reason }]);
      return;
    }
    forgetFailedSend();
    setPages((prev) =>
      prev.map((page) => {
        if (page.id !== id) return page;
        if (page.previewUrl && typeof URL !== "undefined" && "revokeObjectURL" in URL) {
          URL.revokeObjectURL(page.previewUrl);
        }
        return { ...page, file, ink, previewUrl: previewOf(file), blurry: false };
      }),
    );
    flagIfBlurry({ id, file });
    setEditingId(null);
  };

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) void addFiles(event.target.files);
    event.target.value = "";
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer.files.length > 0) void addFiles(event.dataTransfer.files);
  };

  const remove = (id: string) => {
    forgetFailedSend();
    // Removing the page being edited ends the edit: there is nothing left to
    // save it into.
    if (id === editingId) setEditingId(null);
    setPages((prev) => prev.filter((p) => p.id !== id));
  };

  const move = (index: number, delta: number) => {
    forgetFailedSend();
    setPages((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      const [item] = next.splice(index, 1);
      if (item) next.splice(target, 0, item);
      return next;
    });
  };

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
            setMarkingSettled(true);
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
    setMarkingSettled(false);
    setRejections([]);
    setPages([]);
    setEditingId(null);
  };

  // While uploading, the upload phase drives the line; once sent, the worker's
  // stream does.
  const statusLine = useMemo(() => {
    if (processing || upload?.phase === "submitted") return null;
    if (!upload) return null;
    if (upload.phase === "error")
      return upload.pages.some((p) => p.status === "failed")
        ? s.statusFailed
        : s.statusError;
    return s.statusUploading;
  }, [upload, processing]);

  const sent = upload?.phase === "submitted";
  const showingResult =
    processing !== null &&
    (processing.error ||
      (processing.done &&
        (processing.terminalStatus !== "processed" || markingSettled)));
  const marking =
    (sent || processing !== null) && !showingResult && upload?.phase !== "error";
  const sending = locked && !sent && upload?.phase !== "error";
  const heading = sending
    ? s.sendingTitle
    : marking
      ? s.markingTitle
      : showingResult
        ? s.resultTitle
        : s.title;

  const progressFor = (index: number) =>
    upload?.pages.find((p) => p.index === index);

  // The page open on the pad, named by where it sits in the list now.
  const editingIndex = pages.findIndex((page) => page.id === editingId);
  const editingSource = editingIndex >= 0 ? pages[editingIndex] : undefined;
  const editingPage: PadEdit | null =
    editingSource?.ink !== undefined
      ? { id: editingSource.id, label: s.pageLabel(editingIndex + 1), strokes: editingSource.ink }
      : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        {/* At rest the page's own heading names the task; once pages are on
            their way the panel says what is happening instead. */}
        {locked ? <h2 className="font-display text-3xl">{heading}</h2> : null}
        {!locked ? <p className="max-w-prose text-pretty text-ink-muted">{s.intro}</p> : null}
      </div>

      {!locked ? (
        <div className="flex flex-col gap-5">
          <div
            role="group"
            aria-label={s.modeHint}
            className="inline-flex max-w-full gap-0.5 self-start overflow-x-auto rounded-lg bg-surface-sunken p-1"
          >
            {MODES.map(({ mode: option, icon }) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                onClick={() => {
                  // The pad is the only place a page is edited; leaving it
                  // leaves the page as it was.
                  if (option !== "pen") setEditingId(null);
                  setMode(option);
                }}
                className={`${segmentBase} ${mode === option ? segmentOn : segmentOff}`}
              >
                <Icon name={icon} size={14} />
                {modeLabel(option)}
              </button>
            ))}
          </div>

          {mode === "pen" ? (
            <div ref={padRef} className="flex scroll-mt-24 flex-col gap-3">
              {editingPage ? (
                <p role="status" className="text-sm font-medium text-ink">
                  {s.editingNow(editingPage.label)}
                </p>
              ) : null}
              <PenPad
                onCapture={(file, ink) => void addFiles([file], ink)}
                editing={editingPage}
                onSave={savePage}
                onCancelEdit={() => setEditingId(null)}
              />
            </div>
          ) : (
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed border-rule-line bg-surface-sunken/40 px-6 py-10 text-center"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-surface text-ink-muted shadow-raised">
                <Icon name="upload" size={18} />
              </span>
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
                  <span className={buttonClassName("secondary")}>
                    <Icon name={mode === "pdf" ? "file" : "file-import"} size={16} className="text-ink-muted" />
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
                    <span className={buttonClassName("secondary")}>
                      <Icon name="camera" size={16} className="text-ink-muted" />
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

      {pages.length === 0 && !locked ? (
        <EmptyState icon="layers" body={s.empty} />
      ) : pages.length === 0 ? null : (
        <ol className="flex flex-col gap-3">
          {pages.map((page, index) => {
            const prog = progressFor(index);
            return (
              <Card
                key={page.id}
                as="li"
                tone="flat"
                padded={false}
                className="flex items-center gap-4 p-3"
              >
                {page.previewUrl && page.ink && !locked ? (
                  // A page written on the pad opens again on the pad: the
                  // thumbnail is the obvious thing to tap (decision 0103).
                  // Pointer-only: the pen control in the row is the one a
                  // keyboard or a screen reader reaches, so the page is not
                  // announced twice.
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-hidden="true"
                    onClick={() => edit(page.id)}
                    className="shrink-0 cursor-pointer rounded-md"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={page.previewUrl}
                      alt=""
                      className={`size-16 rounded-md border bg-surface-sunken object-cover ${
                        page.id === editingId ? "border-accent" : "border-rule-line"
                      }`}
                    />
                  </button>
                ) : page.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={page.previewUrl}
                    alt=""
                    className="size-16 shrink-0 rounded-md border border-rule-line bg-surface-sunken object-cover"
                  />
                ) : (
                  <div className="size-16 shrink-0 rounded-md bg-surface-sunken" />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-display text-base text-ink">
                    {s.pageLabel(index + 1)}
                    {page.id === editingId ? (
                      <span className="ml-2 font-sans text-xs text-ink-muted">{s.editingTag}</span>
                    ) : null}
                  </span>
                  {page.blurry && !prog ? (
                    <span className="text-xs text-flag-amber">{s.blurry}</span>
                  ) : null}
                  {prog && !sent ? (
                    <progress
                      value={prog.fraction}
                      max={1}
                      className="h-1 w-full rounded-full"
                      aria-label={s.pageLabel(index + 1)}
                    />
                  ) : null}
                </div>
                {prog?.status === "failed" ? (
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={() => controllerRef.current?.retryPage(index)}
                  >
                    <Icon name="refresh" size={14} className="text-ink-muted" />
                    {s.retry(index + 1)}
                  </Button>
                ) : null}
                {!locked ? (
                  <div className="flex shrink-0 gap-0.5">
                    {page.ink ? (
                      <button
                        type="button"
                        aria-label={s.editPage(index + 1)}
                        aria-pressed={page.id === editingId}
                        onClick={() => edit(page.id)}
                        className={rowControl}
                      >
                        <Icon name="pen" size={16} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-label={s.moveUp(index + 1)}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      className={rowControl}
                    >
                      <Icon name="chevron-up" size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={s.moveDown(index + 1)}
                      disabled={index === pages.length - 1}
                      onClick={() => move(index, 1)}
                      className={rowControl}
                    >
                      <Icon name="chevron-down" size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={s.remove(index + 1)}
                      onClick={() => remove(page.id)}
                      className={rowControl}
                    >
                      <Icon name="x" size={16} />
                    </button>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </ol>
      )}

      {statusLine ? (
        <div aria-live="polite" className="text-sm text-ink-muted">
          {statusLine}
        </div>
      ) : null}

      {marking ? <MarkingSteps current={markingStep(processing)} /> : null}

      {processing ? (
        <section aria-live="polite" className="flex flex-col gap-4">
          {showingResult ? (
          <p className="text-ink">
            {processing.terminalStatus === "processed"
              ? s.processed
              : processing.terminalStatus === "needs_retake"
                ? s.needsRetake
                : processing.terminalStatus === "failed"
                  ? s.processFailed
                  : processing.error
                    ? s.streamLost
                    : null}
          </p>
          ) : null}
          {processing.pages.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {processing.pages.map((p) => (
                <li key={p.pageIndex}>
                  {p.rejected ? (
                    <Badge tone="amber">
                      {s.pageRetake(p.pageIndex + 1, p.rejected.message)}
                    </Badge>
                  ) : p.confidence !== undefined && p.confidence < LOW_CONFIDENCE ? (
                    <Badge tone="amber">{s.pageHardToRead(p.pageIndex + 1)}</Badge>
                  ) : (
                    <Badge tone="green">
                      <Icon name="check" size={12} />
                      {s.pageRead(p.pageIndex + 1)}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {showingResult && transcription ? (
            <TranscriptionPreview
              pages={transcription.pages}
              thumbnails={pages.map((p) => p.previewUrl)}
            />
          ) : null}
          {showingResult ? (
          <div className="flex flex-wrap items-center gap-3">
            {/* The defence is offered once the work has been read, and never
                gates the submission (guide 4.2): the scan stands on its own. */}
            {processing.terminalStatus === "processed" &&
            markingSettled &&
            submissionId !== null ? (
              <ButtonLink href={`/course/${caseStudyId}/defence/${submissionId}`}>
                <Icon name="mic" size={16} />
                {s.defend}
              </ButtonLink>
            ) : null}
            {processing.done || processing.error ? (
              <Button variant="quiet" onClick={reset}>
                {s.startOver}
              </Button>
            ) : null}
          </div>
          ) : null}
        </section>
      ) : null}

      {!submitting ? (
        <div className="border-t border-rule-line pt-6">
          <Button
            onClick={() => void submit()}
            disabled={pages.length === 0 || editingPage !== null}
            aria-describedby={editingPage ? "finish-editing" : undefined}
          >
            <Icon name="upload" size={16} />
            {s.submit(pages.length)}
          </Button>
          {editingPage ? (
            // A page open on the pad would otherwise be sent as it was before
            // the change: say so rather than leave a silent disabled button.
            <p id="finish-editing" className="mt-2 text-sm text-ink-muted">
              {s.finishEditing(editingPage.label)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
