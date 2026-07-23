"use client";

// The upload surface (frontend guide 4.1): capture or drop multi-page photos,
// pre-check them on the device, reorder, then send each page straight to
// storage with its own progress and retry (decision 0019). A client island: it
// holds the page list and drives the injected orchestration controller. Bytes
// PUT direct to storage; the authed create and complete come in as bound server
// actions so the seat token never reaches here.
import { useCallback, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Schemas } from "@/lib/api/client";
import { analyzeSharpness } from "@/lib/upload/image-quality";
import {
  type PageFileRejection,
  validatePageFile,
} from "@/lib/upload/page-checks";
import { putPage } from "@/lib/upload/put-page";
import {
  UploadController,
  type UploadDeps,
  type UploadState,
} from "@/lib/upload/upload-controller";
import { strings } from "../../../strings";

export type CreateAction = (
  variantId: number,
  pages: Schemas["PageIn"][],
  idempotencyKey: string,
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
  create,
  complete,
  makeId = () => crypto.randomUUID(),
}: {
  variantId: number;
  create: CreateAction;
  complete: CompleteAction;
  // Injectable so a test need not lean on crypto/URL specifics.
  makeId?: () => string;
}) {
  const [pages, setPages] = useState<SelectedPage[]>([]);
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const controllerRef = useRef<UploadController | null>(null);

  const submitting = upload !== null && upload.phase !== "error";
  const locked = submitting;

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
      create: (manifest, key) => create(variantId, manifest, key),
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
  };

  const statusLine = useMemo(() => {
    if (!upload) return null;
    if (upload.phase === "submitted") return s.statusProcessing;
    if (upload.phase === "error")
      return upload.pages.some((p) => p.status === "failed")
        ? s.statusFailed
        : s.statusError;
    return s.statusUploading;
  }, [upload]);

  const progressFor = (index: number) =>
    upload?.pages.find((p) => p.index === index);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-ink-muted">{s.intro}</p>

      {!locked ? (
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="flex flex-col items-center gap-3 rounded-md border-2 border-dashed border-rule-line px-6 py-10 text-center"
        >
          <p className="text-sm text-ink-muted">{s.dropPrompt}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <label className="cursor-pointer">
              <span className="sr-only">{s.choose}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/heic,application/pdf"
                multiple
                onChange={onInputChange}
                className="sr-only"
                aria-label={s.choose}
              />
              <span className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 font-medium text-on-accent">
                {s.choose}
              </span>
            </label>
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
          </div>
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
