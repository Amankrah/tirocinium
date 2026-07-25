"use client";

// The flagged-variant review queue (frontend guide 4.4): variants where the
// independent re-solve disagreed with the generation solution. Each opens to the
// two solutions side by side; the professor promotes it (it serves as manual),
// edits the solution (which also lands it on manual, taking responsibility), or
// discards it. A client island driving injected server actions; the flagged list
// is the source of truth, so every verb refetches (a promoted, edited, or
// discarded variant leaves the list).
import dynamic from "next/dynamic";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { Schemas } from "@/lib/api/client";
import { strings } from "../../../../../strings";

const ClientProblemBody = dynamic(() =>
  import("@/components/reading/client-problem-body").then((m) => m.ClientProblemBody),
);

const s = strings.variants;

type GetAction = (courseId: number, variantId: number) => Promise<Schemas["VariantDetail"] | null>;
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
  const [details, setDetails] = useState<Record<number, Schemas["VariantDetail"]>>({});
  const [open, setOpen] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [blocked, setBlocked] = useState<number | null>(null);

  async function reload() {
    const page = await refetch(courseId, caseStudyId, { state: "flagged" });
    if (page) setItems(page.items);
  }

  async function onToggle(id: number) {
    if (open === id) {
      setOpen(null);
      return;
    }
    if (!details[id]) {
      const detail = await get(courseId, id);
      if (detail) setDetails((prev) => ({ ...prev, [id]: detail }));
    }
    setOpen(id);
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
    setEditText(details[id]?.solution ?? "");
    setEditing(id);
  }

  if (items.length === 0) {
    return <p className="text-ink-muted">{s.reviewEmpty}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-sm text-ink-muted">{s.reviewIntro}</p>
      {error ? (
        <p role="alert" className="text-sm text-flag-amber">
          {s.reviewError}
        </p>
      ) : null}
      <ol className="flex flex-col gap-4">
        {items.map((item) => {
          const detail = details[item.id];
          const isOpen = open === item.id;
          const isBusy = busy === item.id;
          return (
            <li key={item.id} className="flex flex-col gap-3 rounded-md border border-rule-line p-4">
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
                          className="rounded-md border border-rule-line bg-paper px-3 py-2 font-mono text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        />
                      ) : (
                        <ClientProblemBody body={detail.solution} />
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <h3 className="text-xs uppercase tracking-widest text-ink-muted">
                        {s.reSolve}
                      </h3>
                      {detail.verify_solution ? (
                        <ClientProblemBody body={detail.verify_solution} />
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
