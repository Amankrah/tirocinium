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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import type { Schemas } from "@/lib/api/client";
import { KeyHint } from "../../../../../key-hint";
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

const COLUMN_HEADING = "text-xs font-medium tracking-wide text-ink-muted uppercase";

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
    return <EmptyState icon="check" body={s.reviewEmpty} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <p className="max-w-prose text-sm text-ink-muted">{s.reviewIntro}</p>
        <KeyHint id={KEYS_ID} text={s.reviewKeys} />
      </div>
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
        className="flex flex-col gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
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
              className={
                "flex flex-col gap-4 rounded-lg border p-4 transition-[background-color,border-color] duration-(--motion-duration) ease-(--motion-ease) sm:p-5 " +
                (isCurrent ? "border-accent bg-accent-soft/50" : "border-rule-line bg-surface")
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  {item.seed != null ? <Badge mono>{s.seedLabel(item.seed)}</Badge> : null}
                  {item.flag_reason ? (
                    <span className="text-sm text-flag-amber">{item.flag_reason}</span>
                  ) : null}
                </div>
                <Button variant="secondary" size="sm" onClick={() => void onToggle(item.id)}>
                  {isOpen ? s.cancelEdit : s.reSolve}
                </Button>
              </div>

              {isOpen && detail ? (
                <div className="flex flex-col gap-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="flex flex-col gap-2 rounded-lg bg-surface-sunken p-4">
                      <h3 className={COLUMN_HEADING}>{s.generated}</h3>
                      {editing === item.id ? (
                        <Textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={10}
                          className="font-mono text-sm"
                        />
                      ) : (
                        <ClientProblemBody
                          body={detail.solution}
                          figures={loaded.figures}
                        />
                      )}
                    </div>
                    <div className="flex flex-col gap-2 rounded-lg bg-surface-sunken p-4">
                      <h3 className={COLUMN_HEADING}>{s.reSolve}</h3>
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
                      <span className="font-mono tabular-nums">
                        {detail.final_answers.join(", ")}
                      </span>
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-3 border-t border-rule-line pt-4">
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
                          <Icon name="check" size={16} />
                          {s.promote}
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={isBusy}
                          onClick={() => startEdit(item.id)}
                        >
                          <Icon name="pen" size={16} />
                          {s.editSolution}
                        </Button>
                        <Button
                          variant="danger"
                          disabled={isBusy}
                          onClick={() => void onDiscard(item.id)}
                        >
                          <Icon name="x" size={16} />
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
