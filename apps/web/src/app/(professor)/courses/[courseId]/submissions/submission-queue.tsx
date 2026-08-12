"use client";

// The review queue (guide 4.4, milestone 8.1). A client island for three
// reasons it states here: the j/k keyboard model, the status filter, and paging
// without a round trip through the router. The rows themselves are plain links,
// so the queue works with keyboard, mouse, or neither.
//
// Ordering is the backend's, newest first, and is never re-sorted by volume or
// by grade: a queue sorted by who did most is the per-seat ranking lens the
// mastery spec rules out.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Schemas } from "@/lib/api/client";
import { strings } from "../../../strings";

const s = strings.submissions;
// Ties the queue's focus stop to the line that already lists its keys.
const KEYS_ID = "submissions-queue-keys";

// Below this the reading is worth a closer look; the same threshold the upload
// surface uses, so a student and a professor see the same line.
const LOW_CONFIDENCE = 0.6;

const FILTERS = [
  { value: "", label: s.filterAll },
  { value: "processed", label: s.filterProcessed },
  { value: "needs_retake", label: s.filterNeedsRetake },
  { value: "processing", label: s.filterProcessing },
] as const;

type ListAction = (
  courseId: number,
  options: { status?: string; cursor?: number; limit?: number },
) => Promise<Schemas["SubmissionListOut"] | null>;

export function SubmissionQueue({
  courseId,
  initial,
  list,
  // Injected so the keyboard's open action is assertable without a real
  // navigation, which jsdom does not implement.
  navigate = (href) => {
    window.location.href = href;
  },
}: {
  courseId: number;
  initial: Schemas["SubmissionListOut"];
  list: ListAction;
  navigate?: (href: string) => void;
}) {
  const [rows, setRows] = useState(initial.submissions);
  const [cursor, setCursor] = useState(initial.next_cursor);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(0);

  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  useEffect(() => {
    // Guard the method itself: jsdom (tests) does not implement it.
    rowRefs.current[selected]?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  async function applyFilter(next: string) {
    setStatus(next);
    setBusy(true);
    const page = await list(courseId, next ? { status: next } : {});
    setBusy(false);
    if (page) {
      setRows(page.submissions);
      setCursor(page.next_cursor);
      setSelected(0);
    }
  }

  async function loadMore() {
    if (cursor == null) return;
    setBusy(true);
    const page = await list(courseId, {
      cursor,
      ...(status ? { status } : {}),
    });
    setBusy(false);
    if (page) {
      setRows((prev) => [...prev, ...page.submissions]);
      setCursor(page.next_cursor);
    }
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const tag = (event.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (event.key === "j" || event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((c) => Math.min(rows.length - 1, c + 1));
    } else if (event.key === "k" || event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((c) => Math.max(0, c - 1));
    } else if (event.key === "Enter") {
      const row = rows[selected];
      if (row) {
        event.preventDefault();
        navigate(`/courses/${courseId}/submissions/${row.id}`);
      }
    }
  }

  return (
    // A tab stop, not a programmatic-only region (decision 0067): the filters
    // sit outside the list and must keep answering j and k, so the keys stay on
    // the wrapper and only the way in changes.
    <div
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="group"
      aria-label={s.queueLabel}
      aria-describedby={KEYS_ID}
      className="flex flex-col gap-4 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
    >
      <div role="group" aria-label={s.heading} className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <Button
            key={filter.value || "all"}
            variant={status === filter.value ? "primary" : "quiet"}
            aria-pressed={status === filter.value}
            disabled={busy}
            onClick={() => void applyFilter(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>
      <p id={KEYS_ID} className="text-xs text-ink-muted">
        {s.keys}
      </p>

      {rows.length === 0 ? (
        <p className="text-ink-muted">{s.empty}</p>
      ) : (
        <ol className="flex flex-col">
          {rows.map((row, index) => {
            const low =
              row.recognition_conf !== null && row.recognition_conf < LOW_CONFIDENCE;
            return (
              <li
                key={row.id}
                ref={(node) => {
                  rowRefs.current[index] = node;
                }}
                aria-current={index === selected ? "true" : undefined}
                className={`border-b border-rule-line ${
                  index === selected ? "bg-rule-line/30" : ""
                }`}
              >
                <Link
                  href={`/courses/${courseId}/submissions/${row.id}`}
                  onFocus={() => setSelected(index)}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="font-mono text-sm tabular-nums text-ink">
                    {s.seat(row.seat_number)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {row.case_study_title}
                  </span>
                  <span className="text-sm text-ink-muted">{s.pages(row.page_count)}</span>
                  <span
                    className={`text-sm tabular-nums ${low ? "text-flag-amber" : "text-ink-muted"}`}
                  >
                    {row.recognition_conf === null
                      ? s.noConfidence
                      : s.confidence(Math.round(row.recognition_conf * 100))}
                  </span>
                  {/* Effort made legible to the person who matters (guide
                      4.2b); absent, never zero, when no start was recorded. */}
                  <span className="text-sm tabular-nums text-ink-muted">
                    {row.engaged_seconds === null
                      ? s.noEngaged
                      : s.engaged(Math.round(row.engaged_seconds / 60))}
                  </span>
                  <span className="text-sm tabular-nums text-ink-muted">
                    {row.grade === null ? s.ungraded : s.graded(row.grade)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      {cursor != null ? (
        <div>
          <Button variant="quiet" disabled={busy} onClick={() => void loadMore()}>
            {s.loadMore}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
