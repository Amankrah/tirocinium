"use client";

// The import-from-PDF surface (frontend guide 4.3, the second authoring door):
// choose or drop a PDF, pre-check it on the device, then drive the injected
// import controller (create, PUT direct to storage, complete, poll to ready).
// A client island; the authed calls arrive as bound server actions so the
// professor JWT never reaches here (decision 0019's shape, reused). The review
// step where each detected problem is confirmed is the next milestone.
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Schemas } from "@/lib/api/client";
import {
  ImportController,
  type ImportDeps,
  type ImportFileRejection,
  type ImportState,
  validateImportFile,
} from "@/lib/imports/import-controller";
import { putPage } from "@/lib/upload/put-page";
import { strings } from "../../../strings";

type CreateImport = (
  courseId: number,
  sizeBytes: number,
  idempotencyKey: string,
) => Promise<Schemas["ImportCreated"] | null>;
type CompleteImport = (courseId: number, importId: number) => Promise<boolean>;
type PollImport = (
  courseId: number,
  importId: number,
) => Promise<Schemas["ImportOut"] | null>;

const s = strings.import;

function rejectionLine(reason: ImportFileRejection): string {
  if (reason === "type") return s.rejectedType;
  if (reason === "too_large") return s.rejectedTooLarge;
  return s.rejectedEmpty;
}

export function ImportPanel({
  courseId,
  create,
  complete,
  poll,
  makeId = () => crypto.randomUUID(),
}: {
  courseId: number;
  create: CreateImport;
  complete: CompleteImport;
  poll: PollImport;
  makeId?: () => string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [rejection, setRejection] = useState<ImportFileRejection | null>(null);
  const [state, setState] = useState<ImportState | null>(null);
  const controllerRef = useRef<ImportController | null>(null);

  const running = state !== null && state.phase !== "error" && state.phase !== "ready";

  const pick = (chosen: File | undefined) => {
    if (!chosen) return;
    const reason = validateImportFile(chosen);
    if (reason !== null) {
      setRejection(reason);
      setFile(null);
      return;
    }
    setRejection(null);
    setFile(chosen);
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    pick(event.dataTransfer.files[0]);
  };

  const start = async () => {
    if (!file) return;
    const deps: ImportDeps = {
      create: (size, key) => create(courseId, size, key),
      put: putPage,
      complete: (id) => complete(courseId, id),
      poll: (id) => poll(courseId, id),
      delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      newIdempotencyKey: makeId,
    };
    const controller = new ImportController(deps, setState);
    controllerRef.current = controller;
    await controller.run(file);
  };

  const reset = () => {
    controllerRef.current = null;
    setState(null);
    setFile(null);
    setRejection(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-ink-muted">{s.intro}</p>

      {state === null ? (
        <>
          <div
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            className="flex flex-col items-center gap-3 rounded-md border-2 border-dashed border-rule-line px-6 py-10 text-center"
          >
            <p className="text-sm text-ink-muted">{s.dropPrompt}</p>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  pick(e.target.files?.[0]);
                  e.target.value = "";
                }}
                className="sr-only"
                aria-label={s.choose}
              />
              <span className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 font-medium text-on-accent">
                {s.choose}
              </span>
            </label>
          </div>

          {rejection ? (
            <p role="alert" className="text-sm text-flag-amber">
              {rejectionLine(rejection)}
            </p>
          ) : null}

          {file ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-rule-line p-3">
              <span className="min-w-0 truncate text-sm text-ink">{file.name}</span>
              <Button onClick={() => void start()}>{s.start}</Button>
            </div>
          ) : null}
        </>
      ) : (
        <div aria-live="polite" className="flex flex-col gap-4">
          {running ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-ink">
                {state.phase === "uploading" ? s.uploading : s.reading}
              </p>
              {state.phase === "uploading" ? (
                <progress
                  value={state.progress}
                  max={1}
                  className="h-1 w-full"
                  aria-label={s.uploading}
                />
              ) : null}
            </div>
          ) : null}

          {state.phase === "ready" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink">
                {s.ready(state.pageCount ?? 0)}
              </p>
              <p className="rounded-md border border-rule-line p-3 text-sm text-ink-muted">
                {s.confirmSoon}
              </p>
              <div>
                <Button variant="quiet" onClick={reset}>
                  {s.another}
                </Button>
              </div>
            </div>
          ) : null}

          {state.phase === "error" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-flag-amber">{s.error}</p>
              <div>
                <Button variant="quiet" onClick={reset}>
                  {s.another}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
