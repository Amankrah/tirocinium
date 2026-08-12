"use client";

// The flagged-variant review queue (frontend guide 4.4): variants where the
// independent re-solve disagreed with the generation solution. Each opens to the
// two solutions side by side; the professor promotes it (it serves as manual),
// edits the solution (which also lands it on manual, taking responsibility), or
// discards it. A client island driving injected server actions; the flagged list
// is the source of truth, so every verb refetches (a promoted, edited, or
// discarded variant leaves the list).
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import type { FigureMap } from "@/components/reading/problem-body";
import { Button } from "@/components/ui/button";
import type { Schemas } from "@/lib/api/client";
import { strings } from "../../../../../strings";

const ClientProblemBody = dynamic(() =>
  import("@/components/reading/client-problem-body").then((m) => m.ClientProblemBody),
);

const s = strings.variants;
// Ties the queue's focus stop to the line that already lists its keys, so
// arriving there by keyboard is announced with what the keys do.
const KEYS_ID = "flagged-queue-keys";

// The detail arrives with the figures its two solutions reference already
// resolved, since the resolve carries the professor's token (decision 0066).
type LoadedVariant = { detail: Schemas["VariantDetail"]; figures: FigureMap };
type GetAction = (courseId: number, variantId: number) => Promise<LoadedVariant | null>;
type PromoteAction = (courseId: number, variantId: number) => Promise<Schemas["VariantSummary"] | null>;
type EditAction = (courseId: number, variantId: number, edit: Schemas["VariantEdit"]) => Promise<Schemas["VariantSummary"] | null>;
type DeleteAction = (courseId: number, variantId: number) => Promise<boolean>;
type ListAction = (
  courseId: number,
  caseStudyId: number,
  options: { state?: string; cursor?: number; limit?: number },
) => Promise<Schemas["VariantListOut"] | null>;

export function ReviewQueue({
  courseId,
  caseStudyId,
  initial,
  get,
  promote,
  edit,
  remove,
  refetch,
}: {
  courseId: number;
  caseStudyId: number;
  initial: Schemas["VariantListOut"];
  get: GetAction;
  promote: PromoteAction;
  edit: EditAction;
  remove: DeleteAction;
  refetch: ListAction;
}) {
  const [items, setItems] = useState(initial.items);
  const [details, setDetails] = useState<Record<number, LoadedVariant>>({});
  const [open, setOpen] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [blocked, setBlocked] = useState<number | null>(null);
  const [cursor, setCursor] = useState(0);

  // The j/k model of guide 4.4, a launch requirement here rather than a later
  // refinement: triage is the whole job of this surface and a professor working
  // a queue of flagged variants should never have to reach for the mouse.
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  useEffect(() => {
    // Guard the method itself: jsdom (tests) does not implement it.
    rowRefs.current[cursor]?.scrollIntoView?.({ block: "nearest" });
  }, [cursor]);

  function onKeyDown(event: React.KeyboardEvent) {
    const tag = (event.target as HTMLElement).tagName;
    // Never hijack the keys while the professor is editing a solution.
    if (tag === "TEXTAREA" || tag === "INPUT") return;
    const current = items[cursor];
    if (event.key === "j" || event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => Math.min(items.length - 1, c + 1));
    } else if (event.key === "k" || event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (event.key === "Enter") {
      if (current) {
        event.preventDefault();
        void onToggle(current.id);
      }
    } else if (event.key === "a") {
      if (current) void run(current.id, () => promote(courseId, current.id));
    } else if (event.key === "e") {
      // Editing needs the detail loaded, since the solution is what it edits.
      if (current) {
        void openDetail(current.id).then((loaded) => {
          if (loaded) {
            setEditText(loaded.detail.solution);
            setEditing(current.id);
          }
        });
      }
    }
  }

  async function reload() {
    const page = await refetch(courseId, caseStudyId, { state: "flagged" });
    if (page) setItems(page.items);
  }

  // Open one comparison, loading its detail once. Separate from the toggle
  // because editing must open a card that is already closed and must never
  // close the one it is about to edit.
  async function openDetail(id: number): Promise<LoadedVariant | null> {
    const known = details[id];
    if (known) {
      setOpen(id);
      return known;
    }
    const loaded = await get(courseId, id);
    if (loaded) setDetails((prev) => ({ ...prev, [id]: loaded }));
    setOpen(id);
    return loaded;
  }

  async function onToggle(id: number) {
    if (open === id) {
      setOpen(null);
      return;
    }
    await openDetail(id);
  }

  async function run(id: number, verb: () => Promise<unknown>) {
    setBusy(id);
    setError(false);
    setBlocked(null);
    const outcome = await verb();
    if (outcome === false || outcome === null) setError(true);
    setBusy(null);
    await reload();
  }

  async function onDiscard(id: number) {
    setBusy(id);
    setError(false);
    setBlocked(null);
    const ok = await remove(courseId, id);
    setBusy(null);
    if (!ok) setBlocked(id);
    else await reload();
  }

  function startEdit(id: number) {
    setEditText(details[id]?.detail.solution ?? "");
    setEditing(id);
  }

  if (items.length === 0) {
    return <p className="text-ink-muted">{s.reviewEmpty}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-sm text-ink-muted">{s.reviewIntro}</p>
      <p id={KEYS_ID} className="text-xs text-ink-muted">
        {s.reviewKeys}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-flag-amber">
          {s.reviewError}
        </p>
      ) : null}
      {/* The keys live on the list itself, and the list is a tab stop
          (decision 0067): every control on this surface sits inside it, so a
          professor can Tab straight to the queue and start pressing j and k
          rather than having to click a card first. */}
      <ol
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label={s.reviewQueueLabel}
        aria-describedby={KEYS_ID}
        className="flex flex-col gap-4 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      >
        {items.map((item, index) => {
          const loaded = details[item.id];
          const detail = loaded?.detail;
          const isOpen = open === item.id;
          const isBusy = busy === item.id;
          const isCurrent = index === cursor;
          return (
            <li
              key={item.id}
              ref={(node) => {
                rowRefs.current[index] = node;
              }}
              aria-current={isCurrent ? "true" : undefined}
              className={`flex flex-col gap-3 rounded-md border p-4 ${
                isCurrent ? "border-accent" : "border-rule-line"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  {item.seed != null ? (
                    <span className="text-xs text-ink-muted">{s.seedLabel(item.seed)}</span>
                  ) : null}
                  {item.flag_reason ? (
                    <span className="text-sm text-flag-amber">{item.flag_reason}</span>
                  ) : null}
                </div>
                <Button variant="quiet" onClick={() => void onToggle(item.id)}>
                  {isOpen ? s.cancelEdit : s.reSolve}
                </Button>
              </div>

              {isOpen && detail ? (
                <div className="flex flex-col gap-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-xs uppercase tracking-widest text-ink-muted">
                        {s.generated}
                      </h3>
                      {editing === item.id ? (
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={10}
                          className="rounded-md border border-field-border bg-paper px-3 py-2 font-mono text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        />
                      ) : (
                        <ClientProblemBody
                          body={detail.solution}
                          figures={loaded.figures}
                        />
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <h3 className="text-xs uppercase tracking-widest text-ink-muted">
                        {s.reSolve}
                      </h3>
                      {detail.verify_solution ? (
                        <ClientProblemBody
                          body={detail.verify_solution}
                          figures={loaded.figures}
                        />
                      ) : (
                        <p className="text-sm text-ink-muted">{s.noReSolve}</p>
                      )}
                    </div>
                  </div>

                  {detail.final_answers.length > 0 ? (
                    <p className="text-sm text-ink">
                      <span className="text-ink-muted">{s.answers}: </span>
                      {detail.final_answers.join(", ")}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-3 border-t border-rule-line pt-3">
                    {editing === item.id ? (
                      <>
                        <Button
                          disabled={isBusy}
                          onClick={() =>
                            void run(item.id, () =>
                              edit(courseId, item.id, { body: null, solution: editText }),
                            ).then(() => setEditing(null))
                          }
                        >
                          {s.saveEdit}
                        </Button>
                        <Button variant="quiet" onClick={() => setEditing(null)}>
                          {s.cancelEdit}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          disabled={isBusy}
                          onClick={() => void run(item.id, () => promote(courseId, item.id))}
                        >
                          {s.promote}
                        </Button>
                        <Button variant="quiet" disabled={isBusy} onClick={() => startEdit(item.id)}>
                          {s.editSolution}
                        </Button>
                        <Button
                          variant="quiet"
                          disabled={isBusy}
                          onClick={() => void onDiscard(item.id)}
                        >
                          {s.discard}
                        </Button>
                      </>
                    )}
                  </div>
                  {blocked === item.id ? (
                    <p className="text-sm text-flag-amber">{s.discardBlocked}</p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
